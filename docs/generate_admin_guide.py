#!/usr/bin/env python3
"""
Sales CRM Admin Guide PDF Generator
Generates a comprehensive admin guide with screenshots
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, grey
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle, ListFlowable, ListItem
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from datetime import datetime
import os

# Colors
PRIMARY = HexColor('#6366f1')  # Indigo
SECONDARY = HexColor('#8b5cf6')  # Purple
ACCENT = HexColor('#ec4899')  # Pink
DARK = HexColor('#1f2937')
LIGHT = HexColor('#f3f4f6')

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCREENSHOTS_DIR = os.path.join(SCRIPT_DIR, 'screenshots')
OUTPUT_FILE = os.path.join(SCRIPT_DIR, 'SalesCRM_Admin_Guide.pdf')

def create_styles():
    """Create custom paragraph styles"""
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='MainTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=PRIMARY,
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='SubTitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=DARK,
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading2'],
        fontSize=18,
        textColor=PRIMARY,
        spaceBefore=20,
        spaceAfter=12,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='SubSection',
        parent=styles['Heading3'],
        fontSize=14,
        textColor=SECONDARY,
        spaceBefore=15,
        spaceAfter=8,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='Body',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        fontName='Helvetica',
        leading=16
    ))
    
    styles.add(ParagraphStyle(
        name='BulletItem',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK,
        leftIndent=20,
        spaceAfter=4,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='Caption',
        parent=styles['Normal'],
        fontSize=9,
        textColor=grey,
        alignment=TA_CENTER,
        spaceAfter=15,
        fontName='Helvetica-Oblique'
    ))
    
    styles.add(ParagraphStyle(
        name='TOCEntry',
        parent=styles['Normal'],
        fontSize=12,
        textColor=DARK,
        leftIndent=20,
        spaceAfter=8,
        fontName='Helvetica'
    ))
    
    return styles

def add_image(story, filename, caption, styles, max_width=6*inch, max_height=4*inch):
    """Add an image with caption to the story"""
    image_path = os.path.join(SCREENSHOTS_DIR, filename)
    if os.path.exists(image_path):
        from reportlab.lib.utils import ImageReader
        img_reader = ImageReader(image_path)
        img_width, img_height = img_reader.getSize()
        
        # Calculate aspect ratio
        aspect = img_height / float(img_width)
        
        # Start with max width
        width = max_width
        height = width * aspect
        
        # If height exceeds max, scale down
        if height > max_height:
            height = max_height
            width = height / aspect
        
        img = Image(image_path, width=width, height=height)
        img.hAlign = 'CENTER'
        story.append(img)
        story.append(Paragraph(caption, styles['Caption']))
    else:
        story.append(Paragraph(f"[Screenshot: {caption}]", styles['Caption']))

def build_pdf():
    """Build the complete PDF document"""
    doc = SimpleDocTemplate(
        OUTPUT_FILE,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )
    
    styles = create_styles()
    story = []
    
    # ========== COVER PAGE ==========
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("Sales CRM", styles['MainTitle']))
    story.append(Paragraph("Administrator Guide", styles['MainTitle']))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Complete guide for system administrators", styles['SubTitle']))
    story.append(Paragraph(f"Version 1.0 | {datetime.now().strftime('%B %Y')}", styles['SubTitle']))
    story.append(PageBreak())
    
    # ========== TABLE OF CONTENTS ==========
    story.append(Paragraph("Table of Contents", styles['SectionHeader']))
    story.append(Spacer(1, 0.2*inch))
    
    toc = [
        "1. Introduction",
        "2. User Management",
        "   2.1 User Management Table",
        "   2.2 User Actions",
        "   2.3 User Details Modal",
        "   2.4 Activities Tab",
        "   2.5 Time Logs Tab",
        "   2.6 Sales Logs Tab",
        "   2.7 Call Logs Tab",
        "   2.8 User Info Tab",
        "3. Carrier Management",
        "   3.1 Carrier Table",
        "   3.2 Adding a New Carrier",
        "4. Receiver Management",
        "   4.1 Receiver Table",
        "   4.2 Adding a New Receiver",
        "5. Best Practices",
    ]
    
    for item in toc:
        story.append(Paragraph(item, styles['TOCEntry']))
    
    story.append(PageBreak())
    
    # ========== SECTION 1: INTRODUCTION ==========
    story.append(Paragraph("1. Introduction", styles['SectionHeader']))
    story.append(Paragraph(
        "This guide is designed for administrators of the Sales CRM system. As an administrator, "
        "you have access to powerful tools for managing users, monitoring activity, and ensuring "
        "the smooth operation of your sales team.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("1.1 Admin Capabilities", styles['SubSection']))
    story.append(Paragraph("• <b>User Management</b> - Create, edit, and manage user accounts", styles['BulletItem']))
    story.append(Paragraph("• <b>Activity Monitoring</b> - Track user status changes and online activity", styles['BulletItem']))
    story.append(Paragraph("• <b>Time Tracking</b> - Monitor active and inactive time for each user", styles['BulletItem']))
    story.append(Paragraph("• <b>Sales Oversight</b> - View sales logs and performance for all users", styles['BulletItem']))
    story.append(Paragraph("• <b>Call Monitoring</b> - Access call logs with detailed filtering options", styles['BulletItem']))
    story.append(Paragraph("• <b>Location Tracking</b> - View user location information for security", styles['BulletItem']))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("1.2 Accessing Admin Features", styles['SubSection']))
    story.append(Paragraph(
        "Admin features are accessible from the main navigation bar. Click on 'Admin' dropdown "
        "to access User Management and other administrative functions. Only users with the 'admin' "
        "role can access these features.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # ========== SECTION 2: USER MANAGEMENT ==========
    story.append(Paragraph("2. User Management", styles['SectionHeader']))
    story.append(Paragraph(
        "The User Management page is the central hub for managing all system users. Here you can "
        "view all users, their roles, status, and perform various administrative actions.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 2.1 User Management Table
    story.append(Paragraph("2.1 User Management Table", styles['SubSection']))
    story.append(Paragraph(
        "The main table displays all users in the system with the following columns:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>User</b> - User's avatar and full name", styles['BulletItem']))
    story.append(Paragraph("• <b>Online Status</b> - Shows if user is Online or Offline", styles['BulletItem']))
    story.append(Paragraph("• <b>Last Seen</b> - Date and time of last activity", styles['BulletItem']))
    story.append(Paragraph("• <b>Role</b> - User's role (Admin, Supervisor, Agent, Processor, Verification)", styles['BulletItem']))
    story.append(Paragraph("• <b>Supervisor</b> - Assigned supervisor for agents", styles['BulletItem']))
    story.append(Paragraph("• <b>Account Status</b> - Active or Inactive account status", styles['BulletItem']))
    story.append(Paragraph("• <b>Created</b> - Account creation date", styles['BulletItem']))
    story.append(Paragraph("• <b>Actions</b> - Available administrative actions", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-management.png', 
              'Figure 2.1: User Management Table showing all system users', styles)
    
    story.append(Paragraph(
        "Use the <b>Configure columns</b> button to customize which columns are visible. "
        "Click <b>Add New User</b> to create a new user account.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 2.2 User Actions
    story.append(Paragraph("2.2 User Actions", styles['SubSection']))
    story.append(Paragraph(
        "Each user row has action buttons in the Actions column:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Edit</b> - Modify user details, role, or supervisor assignment", styles['BulletItem']))
    story.append(Paragraph("• <b>Force Logout</b> - Immediately log out the user from all sessions", styles['BulletItem']))
    story.append(Paragraph("• <b>Deactivate/Activate</b> - Toggle user account status", styles['BulletItem']))
    story.append(Paragraph("• <b>Disable/Enable Twilio</b> - Control user's access to calling features", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph(
        "<b>Note:</b> Deactivated users (shown with 'Inactive' status in orange) cannot log into the system "
        "until their account is reactivated.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.2*inch))
    
    # 2.3 User Details Modal
    story.append(Paragraph("2.3 User Details Modal", styles['SubSection']))
    story.append(Paragraph(
        "Click on any user's name to open the User Details Modal. This modal provides comprehensive "
        "information about the user organized into five tabs: Activities, Time Logs, Sales Logs, "
        "Call Logs, and User Info.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph(
        "At the top of the modal, you'll see the user's name, email, role, and current online status. "
        "A date range picker allows you to filter data across all tabs by specific date ranges.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # 2.4 Activities Tab
    story.append(Paragraph("2.4 Activities Tab", styles['SubSection']))
    story.append(Paragraph(
        "The Activities tab shows a chronological log of the user's status changes:",
        styles['Body']
    ))
    story.append(Paragraph("• Status transitions (online to away, away to online, etc.)", styles['BulletItem']))
    story.append(Paragraph("• Timestamp for each status change", styles['BulletItem']))
    story.append(Paragraph("• IP address from which the change occurred", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-activities.png', 
              'Figure 2.2: Activities Tab showing user status change history', styles)
    
    story.append(Paragraph(
        "This information helps monitor user engagement and identify any unusual activity patterns.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.2*inch))
    
    # 2.5 Time Logs Tab
    story.append(Paragraph("2.5 Time Logs Tab", styles['SubSection']))
    story.append(Paragraph(
        "The Time Logs tab provides detailed time tracking for each user:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Date</b> - The specific day being tracked", styles['BulletItem']))
    story.append(Paragraph("• <b>Active Time</b> - Total time the user was actively working (shown in green)", styles['BulletItem']))
    story.append(Paragraph("• <b>Inactive Time</b> - Time the user was idle or away", styles['BulletItem']))
    story.append(Paragraph("• <b>Login Count</b> - Number of times the user logged in that day", styles['BulletItem']))
    story.append(Paragraph("• <b>First/Last Active</b> - First and last activity timestamps", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-timelogs.png', 
              'Figure 2.3: Time Logs Tab showing active and inactive time tracking', styles)
    
    story.append(Paragraph(
        "Use this tab to monitor productivity and ensure users are meeting their work hour requirements.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # 2.6 Sales Logs Tab
    story.append(Paragraph("2.6 Sales Logs Tab", styles['SubSection']))
    story.append(Paragraph(
        "The Sales Logs tab displays all sales activities for the selected user:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Sale Status</b> - Current status (No Response, Voicemail, Sale Done, etc.)", styles['BulletItem']))
    story.append(Paragraph("• <b>Status Badge</b> - Color-coded status indicator", styles['BulletItem']))
    story.append(Paragraph("• <b>Timestamp</b> - Date and time of the sale activity", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Name</b> - Name of the customer", styles['BulletItem']))
    story.append(Paragraph("• <b>Sale ID</b> - Reference number for the sale", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-saleslogs.png', 
              'Figure 2.4: Sales Logs Tab showing user sales activity history', styles)
    
    story.append(Paragraph(
        "The number in parentheses next to the tab name indicates the total count of sales logs "
        "for the selected date range.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.2*inch))
    
    # 2.7 Call Logs Tab
    story.append(Paragraph("2.7 Call Logs Tab", styles['SubSection']))
    story.append(Paragraph(
        "The Call Logs tab provides a comprehensive view of all calls made by the user with "
        "powerful filtering options:",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Filter Options:</b>", styles['Body']))
    story.append(Paragraph("• <b>Select State</b> - Filter by US state", styles['BulletItem']))
    story.append(Paragraph("• <b>City</b> - Filter by city name", styles['BulletItem']))
    story.append(Paragraph("• <b>Phone</b> - Search by phone number", styles['BulletItem']))
    story.append(Paragraph("• <b>Status</b> - Filter by call status (completed, no-answer, busy, etc.)", styles['BulletItem']))
    story.append(Paragraph("• <b>Purpose</b> - Filter by call purpose", styles['BulletItem']))
    story.append(Paragraph("• <b>Source</b> - Filter by call source", styles['BulletItem']))
    story.append(Paragraph("• <b>Notes</b> - Search within call notes", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-calllogs.png', 
              'Figure 2.5: Call Logs Tab with filtering options and call history', styles)
    
    story.append(Paragraph("<b>Call Log Details:</b>", styles['Body']))
    story.append(Paragraph("• <b>Direction Badge</b> - Outbound or Inbound call indicator", styles['BulletItem']))
    story.append(Paragraph("• <b>Status Badge</b> - Call outcome (completed, no-answer)", styles['BulletItem']))
    story.append(Paragraph("• <b>Purpose Badge</b> - Call purpose (follow_up, new lead, etc.)", styles['BulletItem']))
    story.append(Paragraph("• <b>From/To Numbers</b> - Source and destination phone numbers", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Name</b> - Associated customer", styles['BulletItem']))
    story.append(Paragraph("• <b>Duration</b> - Length of the call", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph(
        "Toggle between <b>List</b> and <b>Table</b> view using the buttons in the top right. "
        "Click <b>Apply</b> to apply filters or <b>Clear</b> to reset all filters.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # 2.8 User Info Tab
    story.append(Paragraph("2.8 User Info Tab", styles['SubSection']))
    story.append(Paragraph(
        "The User Info tab displays comprehensive account and location information:",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Account Information:</b>", styles['Body']))
    story.append(Paragraph("• <b>Last Login</b> - Most recent login timestamp", styles['BulletItem']))
    story.append(Paragraph("• <b>Last Logout</b> - Most recent logout timestamp", styles['BulletItem']))
    story.append(Paragraph("• <b>Last Seen</b> - Last activity timestamp", styles['BulletItem']))
    story.append(Paragraph("• <b>Account Status</b> - Active or Inactive", styles['BulletItem']))
    story.append(Paragraph("• <b>Current Status</b> - Online, Offline, or Away", styles['BulletItem']))
    story.append(Paragraph("• <b>Created</b> - Account creation date and time", styles['BulletItem']))
    story.append(Paragraph("• <b>Location Permission</b> - Granted or Denied", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-user-info.png', 
              'Figure 2.6: User Info Tab showing account and location details', styles)
    
    story.append(Paragraph("<b>Location Information:</b>", styles['Body']))
    story.append(Paragraph("• <b>Latitude/Longitude</b> - GPS coordinates of last known location", styles['BulletItem']))
    story.append(Paragraph("• <b>Accuracy</b> - Location accuracy radius in meters", styles['BulletItem']))
    story.append(Paragraph("• <b>Last Updated</b> - When location was last updated", styles['BulletItem']))
    story.append(Paragraph("• <b>View on Google Maps</b> - Button to open location in Google Maps", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph(
        "<b>Security Note:</b> Location tracking helps ensure users are working from authorized locations "
        "and provides an additional layer of security for your organization.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # ========== SECTION 3: CARRIER MANAGEMENT ==========
    story.append(Paragraph("3. Carrier Management", styles['SectionHeader']))
    story.append(Paragraph(
        "Carrier Management allows administrators to manage the list of TV/Internet service providers "
        "that are available in the system. Carriers are used to categorize sales and track which "
        "providers your team is selling.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 3.1 Carrier Table
    story.append(Paragraph("3.1 Carrier Table", styles['SubSection']))
    story.append(Paragraph(
        "The Carrier Management table displays all carriers in the system:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Carrier Name</b> - Name of the carrier with its ID", styles['BulletItem']))
    story.append(Paragraph("• <b>Status</b> - Active or Inactive status badge", styles['BulletItem']))
    story.append(Paragraph("• <b>Created By</b> - User who created the carrier", styles['BulletItem']))
    story.append(Paragraph("• <b>Created</b> - Date when the carrier was added", styles['BulletItem']))
    story.append(Paragraph("• <b>Actions</b> - Edit or Delete options", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-carrier-management.png', 
              'Figure 3.1: Carrier Management table showing all carriers', styles)
    
    story.append(Paragraph(
        "The <b>Total Carriers</b> count is displayed in the top right corner. Common carriers include "
        "Dish, DirecTV, Comcast, Spectrum, AT&T U-verse, Metrocast, and others.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 3.2 Adding a New Carrier
    story.append(Paragraph("3.2 Adding a New Carrier", styles['SubSection']))
    story.append(Paragraph(
        "To add a new carrier, click the <b>Add New Carrier</b> button in the top right. "
        "A modal will appear with the following fields:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Carrier Name</b> - Enter the name of the carrier", styles['BulletItem']))
    story.append(Paragraph("• <b>Status</b> - Select Active or Inactive from the dropdown", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-carrier-add.png', 
              'Figure 3.2: Add New Carrier modal', styles)
    
    story.append(Paragraph(
        "Click <b>Create</b> to add the carrier or <b>Cancel</b> to close the modal. "
        "You can edit or delete existing carriers using the action buttons in each row.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # ========== SECTION 4: RECEIVER MANAGEMENT ==========
    story.append(Paragraph("4. Receiver Management", styles['SectionHeader']))
    story.append(Paragraph(
        "Receiver Management allows administrators to manage the equipment/receiver models "
        "associated with each carrier. Receivers are the devices that customers use to access "
        "services (e.g., Hopper, Joey, Wally for Dish).",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 4.1 Receiver Table
    story.append(Paragraph("4.1 Receiver Table", styles['SubSection']))
    story.append(Paragraph(
        "The Receiver Management table displays all receiver models in the system:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Receiver Name</b> - Name of the receiver model with its ID", styles['BulletItem']))
    story.append(Paragraph("• <b>Carrier</b> - The carrier this receiver belongs to (e.g., Dish)", styles['BulletItem']))
    story.append(Paragraph("• <b>Status</b> - Active or Inactive status badge", styles['BulletItem']))
    story.append(Paragraph("• <b>Created By</b> - User who added the receiver", styles['BulletItem']))
    story.append(Paragraph("• <b>Created</b> - Date when the receiver was added", styles['BulletItem']))
    story.append(Paragraph("• <b>Actions</b> - Edit or Delete options", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-receiver-management.png', 
              'Figure 4.1: Receiver Management table showing all receivers', styles)
    
    story.append(Paragraph(
        "The <b>Total Receivers</b> count is displayed in the top right. Common receivers include "
        "Hopper, Hopper with Sling, Hopper-3, Joey, Joey 2.0, Wireless Joey, Wally, and various "
        "model numbers like 3900, 2700, DP 301.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    # 4.2 Adding a New Receiver
    story.append(Paragraph("4.2 Adding a New Receiver", styles['SubSection']))
    story.append(Paragraph(
        "To add a new receiver, click the <b>Add New Receiver</b> button. "
        "A modal will appear with the following fields:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Receiver Name</b> - Enter the name/model of the receiver", styles['BulletItem']))
    story.append(Paragraph("• <b>Carrier</b> - Select the carrier from the dropdown", styles['BulletItem']))
    story.append(Paragraph("• <b>Status</b> - Select Active or Inactive", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    add_image(story, 'admin-receiver-add.png', 
              'Figure 4.2: Add New Receiver modal', styles)
    
    story.append(Paragraph(
        "Click <b>Create</b> to add the receiver or <b>Cancel</b> to close the modal. "
        "Receivers must be associated with a carrier to properly categorize equipment.",
        styles['Body']
    ))
    story.append(PageBreak())
    
    # ========== SECTION 5: BEST PRACTICES ==========
    story.append(Paragraph("5. Best Practices", styles['SectionHeader']))
    
    story.append(Paragraph("5.1 User Account Management", styles['SubSection']))
    story.append(Paragraph("• Regularly review user accounts and deactivate unused accounts", styles['BulletItem']))
    story.append(Paragraph("• Assign appropriate roles based on job responsibilities", styles['BulletItem']))
    story.append(Paragraph("• Ensure agents are assigned to the correct supervisor", styles['BulletItem']))
    story.append(Paragraph("• Use Force Logout when immediate session termination is needed", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("5.2 Monitoring and Compliance", styles['SubSection']))
    story.append(Paragraph("• Review Time Logs weekly to monitor productivity", styles['BulletItem']))
    story.append(Paragraph("• Check Activities tab for unusual login patterns", styles['BulletItem']))
    story.append(Paragraph("• Use Call Logs filters to investigate specific issues", styles['BulletItem']))
    story.append(Paragraph("• Verify location information for remote workers", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("5.3 Security Recommendations", styles['SubSection']))
    story.append(Paragraph("• Disable Twilio access for users who don't need calling features", styles['BulletItem']))
    story.append(Paragraph("• Deactivate accounts immediately when employees leave", styles['BulletItem']))
    story.append(Paragraph("• Monitor IP addresses in Activities for unauthorized access", styles['BulletItem']))
    story.append(Paragraph("• Regularly verify location permissions are granted", styles['BulletItem']))
    story.append(Spacer(1, 0.3*inch))
    
    # Footer
    story.append(Paragraph(
        f"Sales CRM Admin Guide | Generated {datetime.now().strftime('%Y-%m-%d')}",
        styles['Caption']
    ))
    
    # Build PDF
    doc.build(story)
    print(f"\n✅ Admin guide generated successfully!")
    print(f"📁 Location: {OUTPUT_FILE}\n")

if __name__ == '__main__':
    build_pdf()
