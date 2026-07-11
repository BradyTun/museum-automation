# Museum Automation System

Simple system overview for your museum robot and security setup.

## System Goal

The system helps visitors learn about historical items while improving museum safety.

- A robot follows a floor line.
- It stops at checkpoints.
- The camera scans a QR code at each stop.
- The server gets the text link from the QR code.
- The staff app reads the item information aloud.
- A security system watches motion, smoke, temperature, and humidity.

## High Level Architecture

```mermaid
flowchart TD
    subgraph ROBOT["Robot Car"]
        Nano["Arduino Nano<br/>line following and checkpoints"]
        Cam["ESP32 CAM<br/>MJPEG video"]
    end

    subgraph SEC["Security Node"]
        SecMCU["ESP32 Security<br/>motion, smoke, temp, humidity"]
        Buzzer["Buzzer"]
    end

    subgraph CP["Checkpoint Sensors"]
        CP1["Checkpoint 1 IR"]
        CP2["Checkpoint 2 IR"]
        CP3["Checkpoint 3 IR"]
    end

    subgraph CLOUD["Server on Vercel"]
        API["Flask REST API"]
        DB[("SQLite database")]
        QR["QR decode and text fetch"]
    end

    subgraph STAFF["Staff Side"]
        Dash["Staff Dashboard"]
        App["Staff App voice"]
        Mail["Staff Email Inbox"]
    end

    Cam -->|"WiFi HTTP MJPEG"| API
    Nano -->|"WiFi HTTP JSON status"| API
    SecMCU -->|"WiFi HTTP JSON readings"| API
    SecMCU -->|"on motion or smoke"| Buzzer
    SecMCU -->|"Google SMTP"| Mail
    CP1 & CP2 & CP3 -->|"stop status"| API

    API <--> DB
    API --> QR
    QR -->|"historical text"| App
    API -->|"live data poll"| Dash
    API -->|"item info"| App
    App --> Audio["Read aloud to visitors"]

    classDef brand fill:#fdf2f9,stroke:#c2158a,color:#4a0730;
    classDef cloud fill:#fce7f4,stroke:#9d1069,color:#4a0730;
    class Nano,Cam,SecMCU,Buzzer,CP1,CP2,CP3,Dash,App,Mail,Audio brand;
    class API,DB,QR cloud;
```

## Robot Hardware

### Main Controllers

- Arduino Nano
  - 2 IR sensors for line following
  - 1 IR sensor for checkpoint detection
  - Connected to L298N motor driver
- ESP32 CAM AI Thinker
  - Live video streaming to server

### Power Design

- Power bank powers ESP32 CAM board.
- 3 x 3.7V battery pack powers L298N and motors.
- Arduino Nano gets 5V from the L298N driver board.

### Robot Wiring Diagram

```mermaid
flowchart LR
    subgraph POWER["Power"]
        PB["Power Bank 5V"]
        BAT["3 x 3.7V Li-ion<br/>about 11.1V"]
    end

    subgraph CONTROL["Control"]
        Nano["Arduino Nano"]
        L298["L298N Motor Driver"]
    end

    subgraph SENSORS["IR Sensors"]
        IRL["Line Sensor Left"]
        IRR["Line Sensor Right"]
        IRC["Checkpoint Sensor"]
    end

    subgraph DRIVE["Drive"]
        M1["Motor Left"]
        M2["Motor Right"]
    end

    IRL -->|"D2 digital in"| Nano
    IRR -->|"D3 digital in"| Nano
    IRC -->|"D4 digital in"| Nano

    Nano -->|"D5 ENA PWM"| L298
    Nano -->|"D6 ENB PWM"| L298
    Nano -->|"D7 D8 IN1 IN2"| L298
    Nano -->|"D9 D10 IN3 IN4"| L298

    BAT -->|"12V motor supply"| L298
    L298 -->|"5V regulator to Vin"| Nano
    L298 --> M1
    L298 --> M2

    PB -->|"5V USB"| ESP["ESP32 CAM"]
    ESP -->|"WiFi MJPEG"| Server["Backend Server"]

    classDef brand fill:#fdf2f9,stroke:#c2158a,color:#4a0730;
    class PB,BAT,Nano,L298,IRL,IRR,IRC,M1,M2,ESP,Server brand;
```

## Robot Behavior

```mermaid
flowchart TD
    A(["Power on"]) --> B["Read 2 line sensors"]
    B --> C{"On the line?"}
    C -->|"Both on line"| D["Drive straight, equal PWM"]
    C -->|"Left sensor off"| E["Steer right"]
    C -->|"Right sensor off"| F["Steer left"]
    C -->|"Both off"| G["Line lost, slow and search"]
    D --> H{"Checkpoint IR triggered?"}
    E --> H
    F --> H
    G --> B

    H -->|"No"| B
    H -->|"Yes"| I["Stop motors"]
    I --> J["POST stop status to server"]
    J --> K["ESP32 CAM holds frame"]
    K --> L{"QR decoded by server?"}
    L -->|"No, retry"| K
    L -->|"Yes"| M["Server fetches text file"]
    M --> N["Staff app reads aloud"]
    N --> O["Wait dwell time"]
    O --> P["POST leaving status"]
    P --> B

    classDef brand fill:#fdf2f9,stroke:#c2158a,color:#4a0730;
    class A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P brand;
```

## Robot State Machine

The robot moves through clear states during a tour.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Following: start button
    Following --> Correcting: line drifts
    Correcting --> Following: back on line
    Following --> Searching: line lost
    Searching --> Following: line found
    Following --> Stopped: checkpoint IR high
    Stopped --> Scanning: hold camera frame
    Scanning --> Explaining: QR decoded
    Explaining --> Following: dwell time done
    Stopped --> Following: no QR after retries
    Following --> Idle: stop button
    Idle --> [*]
```

## Security System

The security system reports to the same server.

- Detects motion
- Detects smoke
- Reports temperature
- Reports humidity
- Plays buzzer when motion or smoke is detected
- ESP32 security board sends email alert with Google SMTP when motion or smoke is detected
- Uses 3 checkpoint IR sensors to report robot stop status

```mermaid
flowchart LR
    subgraph NODE["ESP32 Security Node"]
        PIR["PIR Motion"]
        MQ["MQ Smoke and Gas"]
        DHT["DHT Temp and Humidity"]
        Logic["Firmware logic<br/>threshold checks"]
    end

    PIR --> Logic
    MQ --> Logic
    DHT --> Logic

    Logic -->|"motion or smoke"| BZ["Buzzer on"]
    Logic -->|"motion or smoke"| SMTP["Google SMTP email"]
    Logic -->|"every few seconds"| API["Flask API<br/>POST reading"]

    API --> DB[("Readings and Alerts")]
    API -->|"temp over limit or humidity over limit"| ALERT["Create alert"]
    API --> DASH["Dashboard live cards"]
    SMTP --> INBOX["Staff Email"]

    classDef brand fill:#fdf2f9,stroke:#c2158a,color:#4a0730;
    classDef cloud fill:#fce7f4,stroke:#9d1069,color:#4a0730;
    class PIR,MQ,DHT,Logic,BZ,SMTP,INBOX,DASH brand;
    class API,DB,ALERT cloud;
```

### Security Alert Timing

When motion or smoke is found, three things happen at almost the same time.

```mermaid
sequenceDiagram
    autonumber
    participant Sen as Sensors
    participant E as ESP32 Security
    participant A as Flask API
    participant M as Staff Email
    participant D as Dashboard

    Sen->>E: Motion or smoke signal
    par Local alarm
        E->>E: Turn on buzzer
    and Notify staff
        E->>M: Google SMTP email alert
    and Report to server
        E->>A: POST reading with alert flag
        A->>D: Show new alert card
    end
```

## Server Features

- Backend API for robot and security data
- Dashboard for staff to monitor alerts and environment
- Video feed capture from ESP32 CAM
- Security alert events from ESP32 motion and smoke detection
- Google SMTP email alerts to staff for motion and smoke
- QR decode when robot is stopped
- Read text link from QR and fetch historical item text
- Send content to staff app for read aloud

## Simple End to End Flow

```mermaid
sequenceDiagram
    autonumber
    participant N as Arduino Nano
    participant IR as Checkpoint IR
    participant C as ESP32 CAM
    participant A as Flask API
    participant D as Staff Dashboard
    participant S as Staff App

    loop Line following
        N->>N: Read line sensors and steer
    end

    IR-->>N: Checkpoint detected
    N->>N: Stop motors
    N->>A: POST checkpoint stop status
    A->>D: Show robot stopped

    C->>A: Stream MJPEG frame
    A->>A: Decode QR from frame

    alt QR found
        A->>A: Fetch text file from link
        A->>S: Send item title and text
        S->>S: Read aloud to visitors
    else QR not found
        A->>C: Ask for another frame
    end

    N->>A: POST leaving status
    A->>D: Show robot moving
```

## Data Model

The server stores checkpoints, items, sensor readings, alerts, and robot status.

```mermaid
erDiagram
    CHECKPOINT ||--o| HISTORICAL_ITEM : has
    CHECKPOINT ||--o{ CHECKPOINT_EVENT : logs
    ROBOT_STATUS }o--|| CHECKPOINT : "points to"
    SECURITY_READING ||--o{ ALERT : "can trigger"

    CHECKPOINT {
        int id
        string name
        int order_index
        string qr_link
        bool is_stopped
        datetime last_stopped_at
    }
    HISTORICAL_ITEM {
        int id
        int checkpoint_id
        string title
        text summary
        string content_url
    }
    SECURITY_READING {
        int id
        float temperature
        float humidity
        bool motion
        bool smoke
        datetime created_at
    }
    ALERT {
        int id
        string alert_type
        string message
        bool is_resolved
    }
    ROBOT_STATUS {
        int id
        string state
        int current_checkpoint_id
        string video_url
    }
    CHECKPOINT_EVENT {
        int id
        int checkpoint_id
        string event
        datetime created_at
    }
```

## Deployment View

The devices talk to a Flask app hosted on Vercel over the local WiFi.

```mermaid
flowchart LR
    subgraph FIELD["Museum Floor"]
        Robot["Robot Car"]
        SecNode["Security Node"]
        Checkpoints["3 Checkpoints"]
    end

    subgraph NET["Local WiFi"]
        Router["WiFi Router"]
    end

    subgraph VERCEL["Vercel Cloud"]
        Fn["Flask app<br/>api/index.py"]
        Store[("SQLite in /tmp")]
    end

    Browser["Staff Browser<br/>Dashboard and Voice"]

    Robot --> Router
    SecNode --> Router
    Checkpoints --> Router
    Router -->|"HTTPS"| Fn
    Fn <--> Store
    Browser -->|"HTTPS"| Fn

    classDef brand fill:#fdf2f9,stroke:#c2158a,color:#4a0730;
    classDef cloud fill:#fce7f4,stroke:#9d1069,color:#4a0730;
    class Robot,SecNode,Checkpoints,Router,Browser brand;
    class Fn,Store cloud;
```

## Notes

- This design keeps robot control and video processing separated.
- It supports guided tours and live security monitoring at the same time.
