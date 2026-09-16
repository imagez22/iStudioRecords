# 🎵 I Studio Records - Professional Music Studio Booking App

> A modern, responsive web application for booking professional music studios and managing studio sessions.

## 📋 Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [Technologies](#technologies)
- [Authentication](#authentication)
- [Production Deployment](#production-deployment)
- [Contributing](#contributing)
- [Author](#author)
- [License](#license)

---

## ✨ Features

### User Features
- 🔐 **User Registration & Login** - Create non-admin accounts with secure authentication
- 📅 **Book Studios** - Reserve studio sessions with date/time selection
- 💳 **Payment Integration** - Paystack payment gateway integration
- ⭐ **Leave Reviews** - Submit feedback and ratings for studios
- 📊 **Dashboard** - Personal dashboard showing bookings and reviews
- 🔔 **Session Persistence** - Login sessions maintained across page refreshes

### Admin Features
- 👨‍💼 **Admin Panel** - Complete studio management interface
- 📋 **Booking Management** - View, approve, reject, and manage bookings
- 🎸 **Studio Management** - Add, edit, and manage studio listings
- 🎼 **Instrument Management** - Manage available instruments
- 📊 **Analytics** - View reviews and user feedback

### General
- 📱 **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- 🌙 **Dark/Light Theme** - Theme switcher for user preference
- ⚡ **Fast & Lightweight** - Optimized for speed and performance
- 🔒 **Secure Authentication** - Client-side validation and localStorage persistence

---

## 🚀 Quick Start (For GitHub Beginners)

### Prerequisites
You need to have **Node.js** installed on your computer.
- Download from: https://nodejs.org/

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/imagez22/iStudioRecords.git
cd iStudioRecords
```

### 2️⃣ Install Dependencies

```bash
npm install
```

This downloads all required packages (takes 1-2 minutes).

### 3️⃣ Start the Development Server

```bash
npm start
```

The app will open automatically at: **http://localhost:8000**

### 4️⃣ Stop the Server

Press `Ctrl + C` in your terminal to stop the server.

---

## 📖 Installation (Detailed Steps)

### For Windows Users:

```bash
# Step 1: Clone the repository
git clone https://github.com/imagez22/iStudioRecords.git

# Step 2: Navigate to the project folder
cd iStudioRecords

# Step 3: Install dependencies
npm install

# Step 4: Start the server
npm start
```

### For Mac/Linux Users:

```bash
# Same commands as Windows
git clone https://github.com/imagez22/iStudioRecords.git
cd iStudioRecords
npm install
npm start
```

---

## 🎮 Running the Project

### Start Development Server
```bash
npm start
```
- Server runs on: **http://localhost:8000**
- Files auto-refresh when you make changes

### Stop the Server
```bash
Ctrl + C
```
(Press Ctrl and C together in the terminal)

### Run Tests
```bash
npm test
```

### Deploy to GitHub Pages
```bash
npm run deploy
```

---

## 📁 Project Structure

```
iStudioRecords/
├── index.html              # Home page
├── user-dashboard.html     # User dashboard
├── admin.html              # Admin panel
├── auth.js                 # Authentication functions
├── modalLogic.js           # Modal & form handling
├── scripts.js              # Main app logic
├── styles.css              # Styling
├── components.js           # Reusable components
├── db.json                 # Database (studios, users, bookings)
├── package.json            # Project dependencies
├── README.md               # This file
└── images/                 # Image assets
    ├── studio-a.jpg
    ├── studio-b.jpg
    └── ...
```

---

## 🛠️ Technologies Used

### Frontend
- **HTML5** - Structure
- **CSS3** - Styling & animations
- **JavaScript (ES6+)** - Functionality
- **Bootstrap 5** - Responsive framework

### Backend/Data
- **JSON** - Static data storage
- **localStorage** - Client-side data persistence
- **Python 3** - Development server

### Payment
- **Paystack API** - Payment processing

### Tools
- **Git** - Version control
- **npm** - Package manager
- **Jest** - Testing framework

---

## 🔐 Authentication System

### Admin Account (Default)
```
Email: admin@example.com
Password: admin123
```

### User Registration
- Any visitor can create a non-admin account
- Minimum password: 8 characters
- Email must be unique
- All new accounts are non-admin by default

### Login Features
- Session persists across page refreshes
- localStorage stores user data
- Automatic redirect based on user role

---

## 📊 User Flow

### New User Registration
```
1. Click "Login" button
2. Click "Create one" link
3. Fill in name, email, password
4. Account created automatically
5. Redirected to personal dashboard
```

### Booking a Studio
```
1. Login to your account
2. Go to "Book a Studio"
3. Select studio and date/time
4. Submit booking request
5. Admin approves/rejects
6. View status in dashboard
```

### Submit Feedback
```
1. Login to your account
2. Click studio "Read More" button
3. Fill rating and message
4. Submit feedback
5. View in "My Reviews"
```

---

## 💻 Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start development server |
| `npm test` | Run tests |
| `npm run deploy` | Deploy to GitHub Pages |
| `git add -A` | Stage all changes |
| `git commit -m "message"` | Commit changes |
| `git push origin main` | Push to GitHub |

---

## 🌐 Production Deployment

### Netlify
- Site: https://istudiorecordx.netlify.app/
- Custom Domain: istudiorecords.space
- Auto-deploys on git push

### GitHub Pages
- Command: `npm run deploy`
- Site: https://imagez22.github.io/iStudioRecords

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature`
3. **Make** your changes
4. **Test** your changes locally
5. **Commit**: `git commit -m "Add feature"`
6. **Push**: `git push origin feature/your-feature`
7. **Create** a Pull Request

---

## 👨‍💻 Author

**Akli Joshua Eric Yao**
- 📧 Email: aklijoshuaericy@gmail.com
- 🐙 GitHub: [@imagez22](https://github.com/imagez22)
- 🔗 Repository: [iStudioRecords](https://github.com/imagez22/iStudioRecords)

---

## 📄 License

This project is licensed under the **ISC License** - see LICENSE file for details.

---

## ❓ Frequently Asked Questions

### Q: How do I reset my password?
A: Currently, there's no password reset feature. Contact admin for assistance.

### Q: Can I change my booking?
A: No, but you can request a new booking and cancel the old one (admin approval required).

### Q: Is my payment information safe?
A: Yes! Payments are processed through Paystack, a secure payment gateway.

### Q: How long does admin approval take?
A: Usually within 24 hours. Check your dashboard for status updates.

---

## 🐛 Troubleshooting

### Issue: Server won't start
```bash
# Clear npm cache and reinstall
npm cache clean --force
npm install
npm start
```

### Issue: Port 8000 already in use
```bash
# Try a different port
python3 -m http.server 8001
```

### Issue: Changes not showing up
```bash
# Clear browser cache (Ctrl+Shift+Delete) and refresh (Ctrl+F5)
```

---

## 📞 Support

Need help? 
- 📧 Email: aklijoshuaericy@gmail.com
- 🐛 Report bugs on [GitHub Issues](https://github.com/imagez22/iStudioRecords/issues)
- 💬 Check [Discussions](https://github.com/imagez22/iStudioRecords/discussions)

---

## 🎉 Thank You!

Thanks for checking out I Studio Records! If you find this project helpful, please give it a ⭐ on GitHub!

Happy coding! 🚀 
