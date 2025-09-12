# Sales CRM - Customer Relationship Management System

A modern, responsive CRM application built with Next.js and Tailwind CSS to help manage sales processes, customers, leads, and deals efficiently.

## Features

- **Responsive Design**: Fully responsive layout that works on desktop, tablet, and mobile devices
- **Modern UI**: Clean and intuitive interface with smooth animations and transitions
- **Dashboard**: Comprehensive sales dashboard with key metrics and analytics
- **Customer Management**: Track and manage customer information
- **Lead Tracking**: Monitor and follow up on sales leads
- **Sales Management**: Track and manage sales records
- **Reports**: Generate insights and reports on sales performance

## Components

### Navbar
- Responsive navigation with mobile hamburger menu
- Logo and branding
- Main navigation links (Dashboard, Customers, Leads, Reports)
- User profile dropdown

### Home Dashboard
- Sales statistics and KPIs
- Quick action buttons
- Recent activity feed
- Top deals overview
- Tabbed interface for different views

### Footer
- Company information and branding
- Quick links to main sections
- Support and legal links
- Social media links

## Technology Stack

- **Framework**: Next.js 15.5.2
- **Styling**: Tailwind CSS 4
- **Fonts**: Geist Sans and Geist Mono
- **Icons**: Heroicons (SVG)
- **Responsive**: Mobile-first design approach

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   Navigate to [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
crm/
├── app/
│   ├── globals.css          # Global styles and responsive utilities
│   ├── layout.js            # Root layout with Navbar and Footer
│   └── page.js              # Home page
├── components/
│   ├── Navbar.js            # Responsive navigation component
│   ├── Footer.js            # Footer component
│   └── Home.js              # Dashboard home component
├── public/                  # Static assets
└── package.json
```

## Responsive Design

The application is built with a mobile-first approach and includes:

- **Breakpoints**: 
  - Mobile: < 768px
  - Tablet: 768px - 1024px
  - Desktop: > 1024px

- **Features**:
  - Collapsible mobile navigation
  - Responsive grid layouts
  - Touch-friendly buttons and interactions
  - Optimized typography for different screen sizes

## Customization

### Colors
The application uses a blue color scheme that can be customized by modifying the Tailwind classes in the components.

### Content
Update the sample data in the Home component to reflect your actual CRM data.

### Navigation
Modify the navigation links in the Navbar component to match your application structure.

## Future Enhancements

- [ ] User authentication and authorization
- [ ] Database integration
- [ ] Real-time notifications
- [ ] Advanced reporting and analytics
- [ ] Email integration
- [ ] Calendar integration
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).