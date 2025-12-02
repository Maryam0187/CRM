# Marketing Landing Page

A beautiful, modern marketing website for the SalesCRM application designed to attract and convert customers.

## Access the Marketing Page

Visit: **`/marketing`**

For example:
- Local: `http://localhost:3000/marketing`
- Production: `https://your-domain.com/marketing`

## Features

The marketing page includes:

### 1. **Hero Section**
- Eye-catching headline with gradient text
- Clear value proposition
- Call-to-action buttons (Start Free Trial, Watch Demo)
- Key statistics (100% Browser-Based, 24/7 Support, 99.9% Uptime)
- Animated background blobs

### 2. **Features Showcase**
- 12 comprehensive feature cards highlighting:
  - Advanced Dashboard
  - Integrated Voice Calling (Twilio)
  - Customer Management
  - Sales Pipeline
  - Appointment Scheduling
  - Payment Tracking
  - Real-time Notifications
  - Call Recording & Logs
  - Call Transfers
  - Supervisor Tools
  - Time & Activity Tracking
  - Role-Based Access Control

### 3. **Interactive Demo Section**
- Tabbed interface showcasing different aspects:
  - Dashboard Overview
  - Web-Based Calling
  - Customer Management
  - Sales Pipeline
- Each demo section includes:
  - Visual representation
  - Feature list
  - "Try It Now" button

### 4. **Benefits Section**
- Three key benefits:
  - Lightning Fast performance
  - Secure & Reliable
  - Fully Responsive

### 5. **Call-to-Action Section**
- Prominent CTA with gradient background
- Multiple action buttons
- Social proof messaging

### 6. **Footer**
- Company information
- Quick links
- Legal links

## Design Features

- **Modern UI**: Gradient backgrounds, smooth animations, and hover effects
- **Fully Responsive**: Works on desktop, tablet, and mobile
- **Smooth Animations**: Fade-in effects, blob animations, and transitions
- **Accessible**: Proper semantic HTML and keyboard navigation
- **Fast Loading**: Optimized for performance

## Customization

To customize the marketing page:

1. **Update Content**: Edit `components/MarketingLanding.js`
2. **Change Colors**: Modify gradient classes (e.g., `from-blue-600 to-indigo-600`)
3. **Add Features**: Add items to the `features` array
4. **Modify Demo**: Update the `demoSections` array
5. **Update Links**: Change sign-in and CTA links as needed

## Integration with Main App

The marketing page is separate from the main CRM application:
- It has its own navigation (no app navbar/footer)
- Accessible without authentication
- Links to `/signin` for user registration/login
- Can be set as the homepage for public access

## Making It the Homepage

If you want the marketing page to be the homepage for unauthenticated users:

1. Update `app/page.js` to conditionally show marketing or dashboard
2. Or redirect unauthenticated users to `/marketing`
3. Keep authenticated users on the main dashboard

Example implementation in `app/page.js`:
```javascript
'use client';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import MarketingLanding from '../components/MarketingLanding';

export default function Page() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) return <div>Loading...</div>;
  
  if (!user) {
    return <MarketingLanding />;
  }
  
  // Redirect authenticated users to dashboard
  router.push('/dashboard');
  return null;
}
```

## SEO Optimization

The marketing page includes:
- Proper meta tags in `app/marketing/page.js`
- Semantic HTML structure
- Descriptive headings
- Alt text for images (when added)

## Next Steps

1. Add real screenshots or videos to the demo section
2. Add customer testimonials
3. Add pricing information (if applicable)
4. Add contact form
5. Integrate with analytics (Google Analytics, etc.)
6. Add live chat widget
7. A/B test different CTAs

