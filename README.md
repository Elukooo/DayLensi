# DayLens

DayLens is a personal reflection and journaling application that helps users track and document their daily activities across key life categories. Built with vanilla JavaScript and Firebase, it provides a simple yet powerful way to maintain a personal log of daily experiences.

## Features

- **User Authentication**: Secure sign-up and login with email/password, plus guest access option
- **Daily Logging**: Create, edit, and delete daily logs with structured entries
- **Structured Reflection**: Log entries organized into categories:
  - Create: Creative activities and projects
  - Connect: Social interactions and relationships
  - Learn: Educational activities and knowledge gained
  - Meditate: Mindfulness and meditation practices
  - Notes: Additional personal notes
- **Week-based View**: Navigate through weeks to see your daily logs in context
- **Responsive Design**: Works well on both desktop and mobile devices
- **Real-time Updates**: Changes are reflected immediately across all devices

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 with Tailwind CSS
- **Backend**: Firebase (Authentication and Firestore)
- **Hosting**: GitHub Pages with custom domain

## How to Use

1. **Sign Up/Log In**: Create an account with your email and password, or continue as a guest
2. **Add Daily Logs**: Click the "Add Day Log" button to create a new entry
3. **Fill in Details**: Enter the date and your activities in the appropriate categories
4. **Save**: Your entry is saved to your personal collection
5. **View Logs**: Browse your logs by week using the navigation controls
6. **Edit/Delete**: Modify or remove entries as needed

## Project Structure

- `index.html`: Main application entry point
- `script.js`: Core application logic, Firebase integration, and UI rendering
- `style.css`: Tailwind CSS styles
- `CNAME`: GitHub Pages custom domain configuration

## Firebase Configuration

The application is configured to work with a Firebase project. The configuration is already included in the `script.js` file. For security reasons, production applications should implement proper security rules and consider using environment variables for configuration.

## Local Development

1. Clone or download the repository
2. Open `index.html` in your preferred web browser
3. The application will connect to the configured Firebase project

## Security Considerations

- The application uses Firebase security rules to ensure users can only access their own data
- Authentication is required for creating, editing, or deleting logs
- Guest users can use the application but their data may not persist across sessions

## Custom Domain

The application is configured to work with the custom domain `ns1.unaux.com` as specified in the CNAME file.

## License

This project is open source and available under the MIT License.