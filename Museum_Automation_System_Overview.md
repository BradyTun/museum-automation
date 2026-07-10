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
    Robot[Line Follower Robot] -->|Live video feed| Server[Backend API Server]
    Security[Security System] -->|Sensor data| Server
    Security -->|Google SMTP email alerts| StaffEmail[Staff Email Inbox]
    Checkpoints[3 Checkpoint IR Sensors] -->|Stop status| Server

    Server --> Dashboard[Staff Dashboard]
    Server --> StaffApp[Staff App]
    StaffApp --> Audio[Read aloud item information]
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
    IRL[IR Line Sensor Left] --> Nano[Arduino Nano]
    IRR[IR Line Sensor Right] --> Nano
    IRC[IR Checkpoint Sensor] --> Nano

    Nano --> Driver[L298N Motor Driver]
    Driver --> Motors[DC Motors]

    Batt[3 x 3.7V Battery] --> Driver
    Driver -->|5V output| Nano

    PowerBank[Power Bank] --> ESP[ESP32 CAM AI Thinker]
    ESP -->|Video stream| Server[Backend Server]
```

## Robot Behavior

```mermaid
flowchart TD
    A[Start] --> B[Follow line]
    B --> C{Checkpoint detected}

    C -- No --> B
    C -- Yes --> D[Stop at checkpoint]

    D --> E[Capture camera frame]
    E --> F{QR found}

    F -- No --> E
    F -- Yes --> G[Read QR link]

    G --> H[Fetch historical text file]
    H --> I[Staff app reads aloud]
    I --> J[Continue to next checkpoint]
    J --> B
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
    Motion[Motion Sensor] --> Ctrl[ESP32 Security Controller]
    Smoke[Smoke Sensor] --> Ctrl
    Temp[Temperature Sensor] --> Ctrl
    Humid[Humidity Sensor] --> Ctrl

    Ctrl -->|Motion or smoke alert| Buzzer[Buzzer]
    Ctrl -->|Google SMTP email alert| Email[Staff Email Inbox]
    Ctrl -->|Data and events| Server[Backend API Server]
    Server --> Dashboard[Staff Dashboard]
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
    participant Car as Robot Car
    participant Cam as ESP32 CAM
    participant API as Backend API
    participant App as Staff App

    Car->>Car: Follow line
    Car->>Car: Stop at checkpoint
    Cam->>API: Send video frame
    API->>API: Decode QR and get text link
    API->>API: Fetch historical text
    API->>App: Send item information
    App->>App: Read aloud to visitors
```

## Notes

- This design keeps robot control and video processing separated.
- It supports guided tours and live security monitoring at the same time.
