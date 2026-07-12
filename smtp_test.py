import smtplib
from email.mime.text import MIMEText

# Gmail account and app password
smtp_server = "smtp.gmail.com"
smtp_port = 587
sender_email = "pixellab.ygn@gmail.com"
app_password = "mggc gwsg vxkx eged"  # your 16-character app password
receiver_email = "pixellab.ygn@gmail.com"  # test by sending to yourself

# Create the email
subject = "SMTP Python Test"
body = "This is a test email sent via Python SMTP using Gmail."
msg = MIMEText(body)
msg["Subject"] = subject
msg["From"] = sender_email
msg["To"] = receiver_email

try:
    # Connect to Gmail SMTP server
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()  # Secure the connection
    server.login(sender_email, app_password)
    server.sendmail(sender_email, receiver_email, msg.as_string())
    print("Email sent successfully!")
    server.quit()
except Exception as e:
    print("Error:", e)
