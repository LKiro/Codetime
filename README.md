# ⏰ Codetime - Track Your Coding Time Easily

## 🚀 Getting Started

Welcome to Codetime, your self-hosted coding time tracker. This app helps you manage your coding sessions effortlessly. Follow the steps below to install and start using Codetime.

## 📥 Download Codetime

[![Download Codetime](https://img.shields.io/badge/Download%20Codetime-Here-blue)](https://github.com/LKiro/Codetime/releases)

Use the button above to visit our Releases page. 

## 📂 System Requirements

Before you download, make sure your system meets these requirements:

- **Operating System**: Linux, macOS, or Windows
- **Node.js**: Version 14 or higher
- **MySQL**: Version 5.7 or higher
- **Docker**: Recommended for easy setup (optional)

## 🔧 Features

- **Time Tracking**: Automatically records the time you spend coding.
- **Dashboard**: Vue and Vite-based dashboard with dark mode for easy viewing.
- **Authentication**: Secure access via hashed token authentication and GitHub OAuth.
- **Storage**: Uses MySQL to save your data securely.
- **Metrics**: Integrates Prometheus for detailed performance metrics.
- **VS Code Extension**: Sends heartbeat signals every minute to track your active time.

## 📥 Download & Install

To get started with Codetime:

1. **Visit the Releases Page**  
   Click this link: [Download Codetime](https://github.com/LKiro/Codetime/releases) to go to the Releases page.

2. **Choose the Version**  
   Find the latest version at the top of the page. Look for files with the `.tar.gz` or `.zip` extension.

3. **Download the File**  
   Click on the file that matches your system. It will start downloading automatically.

4. **Extract the Files**  
   Once downloaded, locate the file on your computer. Extract its contents using your favorite extraction tool.

5. **Run the Application**  
   Navigate to the extracted folder. Open a terminal (or command prompt) and run the following command to start the server: 
   ```
   node server.js
   ```
   This will launch the application on your local server.

6. **Access the Dashboard**  
   Open a web browser and go to `http://localhost:3000` to view the dashboard. 

7. **Set Up MySQL Database**  
   You’ll need a MySQL database for storing your data. Follow these steps:
   - Create a new database named `codetime`.
   - Adjust the configuration file in the extracted folder to include your database credentials.

8. **Enjoy Tracking Your Time!**  
   Sign in using GitHub OAuth or create a new account to start tracking your coding time.

## 🌐 Configuration

Codetime offers various configuration options. You can set preferences directly inside the configuration file located in the extracted folder. Here are some common settings you might change:

- **Database Connection**: Set the database type and connection parameters.
- **Port**: Change the port if `3000` is already in use.
- **OAuth Settings**: Input your GitHub OAuth credentials to enable secure sign-in.

## 🔍 Troubleshooting

If you encounter issues, here are a few common solutions:

- **Server Not Starting**: Verify that Node.js is installed and available in your command line. 
- **Database Connection Error**: Check your MySQL credentials in the configuration file.
- **Dashboard Not Loading**: Ensure your server is running by checking your terminal for errors.

## 🛡️ Security

Your coding activity is protected with hashed token authentication. Always use secure passwords for your database and OAuth account on GitHub.

## 💬 Support

For further assistance, please open an issue on our GitHub repository, or ask for help in our community forums. 

## 📆 Roadmap

We’re continually improving Codetime. Here are some planned features:

- More integrations with popular IDEs.
- Enhanced reporting metrics.
- Mobile app version for tracking on the go.

## 📜 License

Codetime is open-source software licensed under the MIT License. You are free to use and distribute it.

Thank you for using Codetime! We hope it helps you keep track of your coding sessions effectively.