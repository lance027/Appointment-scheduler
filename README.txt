APPOINTMENT SCHEDULER (plain HTML / CSS / JavaScript)

RUN IT
  Double-click index.html. That's it.

DEPLOY TO RENDER (Static Site)
  1. Put index.html, style.css and app.js in a GitHub repo (top level).
  2. Render -> New -> Static Site -> pick the repo.
  3. Build Command: (leave empty)   Publish Directory: .
  4. Create Static Site.

DEMO ADMIN LOGIN
  admin@example.com / admin123
  Customers: use Register.

EMAIL OTP ON REGISTRATION
  New accounts must enter a 6-digit code (valid 10 min, 5 tries, 30s resend).
  Until you set up EmailJS the app runs in DEMO MODE and shows the code on screen.
  For real emails: create a free account at emailjs.com, add an email service and a
  template using {{to_email}}, {{to_name}}, {{otp}}, {{expires_min}} (set "To email"
  to {{to_email}}), then fill in EMAILJS { serviceId, templateId, publicKey } near
  the top of app.js. (The public key is meant to be public; in EmailJS settings,
  restrict it to your site's domain.)

NOTE
  Data is saved in each browser (localStorage). It is NOT shared between
  devices or users. Use the "Reset all demo data" button on the Services
  page to start over.
