#!/usr/bin/env python3
"""
SalesCRM Agent & Supervisor User Guide Generator
Generates a PDF user guide with screenshots for agents and supervisors.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, grey, black
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
import os
from datetime import datetime

# Colors
PRIMARY = HexColor('#6366f1')
SECONDARY = HexColor('#0ea5e9')
SUCCESS = HexColor('#22c55e')
WARNING = HexColor('#f59e0b')
DARK = HexColor('#1f2937')
LIGHT = HexColor('#f3f4f6')

def create_styles():
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='DocTitle',
        parent=styles['Title'],
        fontSize=32,
        textColor=PRIMARY,
        spaceAfter=20,
        alignment=TA_CENTER
    ))
    
    styles.add(ParagraphStyle(
        name='DocSubtitle',
        parent=styles['Normal'],
        fontSize=16,
        textColor=grey,
        spaceAfter=40,
        alignment=TA_CENTER
    ))
    
    styles.add(ParagraphStyle(
        name='ChapterTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=PRIMARY,
        spaceBefore=30,
        spaceAfter=15,
        borderWidth=2,
        borderColor=PRIMARY,
        borderPadding=10
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=SECONDARY,
        spaceBefore=20,
        spaceAfter=10
    ))
    
    styles.add(ParagraphStyle(
        name='Body',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        leading=16
    ))
    
    styles.add(ParagraphStyle(
        name='BulletItem',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK,
        leftIndent=25,
        spaceAfter=5,
        bulletIndent=10
    ))
    
    styles.add(ParagraphStyle(
        name='NumberedStep',
        parent=styles['Normal'],
        fontSize=11,
        textColor=DARK,
        leftIndent=25,
        spaceAfter=5
    ))
    
    styles.add(ParagraphStyle(
        name='Tip',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#065f46'),
        backColor=HexColor('#d1fae5'),
        borderPadding=12,
        spaceBefore=10,
        spaceAfter=10,
        leftIndent=10,
        rightIndent=10
    ))
    
    styles.add(ParagraphStyle(
        name='Warning',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#92400e'),
        backColor=HexColor('#fef3c7'),
        borderPadding=12,
        spaceBefore=10,
        spaceAfter=10,
        leftIndent=10,
        rightIndent=10
    ))
    
    styles.add(ParagraphStyle(
        name='ImageCaption',
        parent=styles['Normal'],
        fontSize=10,
        textColor=grey,
        alignment=TA_CENTER,
        spaceBefore=5,
        spaceAfter=15
    ))
    
    return styles

def add_image(story, img_path, caption, width=6*inch):
    """Add an image with caption to the story"""
    if os.path.exists(img_path):
        img = Image(img_path, width=width, height=width*0.6)
        story.append(img)
        styles = create_styles()
        story.append(Paragraph(f"<i>{caption}</i>", styles['ImageCaption']))
    else:
        styles = create_styles()
        story.append(Paragraph(f"[Screenshot: {caption}]", styles['ImageCaption']))

def generate_pdf():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    screenshots_dir = os.path.join(script_dir, 'screenshots')
    output_file = os.path.join(script_dir, 'SalesCRM_Agent_Supervisor_Guide.pdf')
    
    doc = SimpleDocTemplate(
        output_file,
        pagesize=letter,
        rightMargin=0.6*inch,
        leftMargin=0.6*inch,
        topMargin=0.6*inch,
        bottomMargin=0.6*inch
    )
    
    styles = create_styles()
    story = []
    
    # ===== TITLE PAGE =====
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph("SalesCRM", styles['DocTitle']))
    story.append(Paragraph("Agent & Supervisor Guide", styles['DocTitle']))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("Your Complete Guide to Managing Sales and Calls", styles['DocSubtitle']))
    story.append(Spacer(1, 0.5*inch))
    
    # Add signin screenshot as cover image
    signin_img = os.path.join(screenshots_dir, '01-signin-page.png')
    if os.path.exists(signin_img):
        img = Image(signin_img, width=4*inch, height=2.5*inch)
        story.append(img)
    
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph(f"Version 1.0 | {datetime.now().strftime('%B %Y')}", styles['DocSubtitle']))
    story.append(PageBreak())
    
    # ===== TABLE OF CONTENTS =====
    story.append(Paragraph("Table of Contents", styles['ChapterTitle']))
    story.append(Spacer(1, 0.2*inch))
    
    toc = [
        "1. Getting Started",
        "    1.1 Signing In",
        "    1.2 Location Permission",
        "    1.3 Navigation Overview",
        "    1.4 IVR Dialer (Phone Icon)",
        "2. Your Dashboard",
        "    2.1 Appointments Summary",
        "    2.2 Sales Table",
        "    2.3 Filtering Sales",
        "3. Making Calls (Dialing)",
        "    3.1 Lead Dialing",
        "    3.2 Quick Dial",
        "    3.3 Check Number",
        "    3.4 Call History",
        "4. Managing Sales",
        "    4.1 Creating a New Sale",
        "    4.2 Sale Status Workflow",
        "    4.3 Adding Payment Info",
        "    4.4 Adding Notes to Sales",
        "5. Customers",
        "6. Appointments",
        "7. For Supervisors",
        "8. Tips & Troubleshooting"
    ]
    
    for item in toc:
        story.append(Paragraph(item, styles['Body']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 1: GETTING STARTED =====
    story.append(Paragraph("1. Getting Started", styles['ChapterTitle']))
    
    story.append(Paragraph("1.1 Signing In", styles['SectionHeader']))
    story.append(Paragraph(
        "Welcome to SalesCRM! To access the system, you'll need to sign in with your credentials provided by your administrator.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, '01-signin-page.png'), 
              "Figure 1.1: Sign In Page")
    
    story.append(Paragraph("<b>To sign in:</b>", styles['Body']))
    story.append(Paragraph("1. Enter your <b>Email Address</b> provided by your manager", styles['NumberedStep']))
    story.append(Paragraph("2. Enter your <b>Password</b>", styles['NumberedStep']))
    story.append(Paragraph("3. Check <b>Remember Me</b> to stay signed in (optional)", styles['NumberedStep']))
    story.append(Paragraph("4. Click <b>Sign In</b>", styles['NumberedStep']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("1.2 Location Permission", styles['SectionHeader']))
    story.append(Paragraph(
        "SalesCRM requires location access for timezone detection and security. When prompted:",
        styles['Body']
    ))
    story.append(Paragraph("• Click <b>Allow</b> when your browser asks for location permission", styles['BulletItem']))
    story.append(Paragraph("• If blocked, click the lock icon in the address bar and enable Location", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Tip:</b> Location helps display appointment times in your customer's timezone!",
        styles['Tip']
    ))
    
    story.append(Paragraph("1.3 Navigation Overview", styles['SectionHeader']))
    story.append(Paragraph(
        "After signing in, you'll see the navigation bar at the top with these options:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>My Dashboard</b> - Your main sales overview", styles['BulletItem']))
    story.append(Paragraph("• <b>Dialing</b> - Make calls and view call history", styles['BulletItem']))
    story.append(Paragraph("• <b>Customers</b> - View your customers", styles['BulletItem']))
    story.append(Paragraph("• <b>IVR Calls</b> - View IVR call history", styles['BulletItem']))
    story.append(Paragraph("• <b>+ New Sale</b> - Create a new sale (green button)", styles['BulletItem']))
    story.append(Paragraph("• <b>Phone Icon (IVR Dialer)</b> - Quick dial for IVR/helpline calls", styles['BulletItem']))
    story.append(Paragraph("• <b>Bell Icon</b> - View notifications", styles['BulletItem']))
    
    story.append(Paragraph("1.4 IVR Dialer (Phone Icon)", styles['SectionHeader']))
    story.append(Paragraph(
        "The phone icon in the navbar opens the <b>IVR Dialer</b> - a quick way to make helpline or IVR calls without leaving your current page.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'ivr-dialer.png'), 
              "Figure 1.2: IVR Dialer - Click the phone icon to open the dialer panel")
    
    story.append(Paragraph("<b>How to use the IVR Dialer:</b>", styles['Body']))
    story.append(Paragraph("1. Click the <b>phone icon</b> in the navigation bar (next to notifications bell)", styles['NumberedStep']))
    story.append(Paragraph("2. The Phone Dialer panel will appear on the right side", styles['NumberedStep']))
    story.append(Paragraph("3. Use the <b>keypad</b> to enter the phone number", styles['NumberedStep']))
    story.append(Paragraph("4. Click <b>Options</b> to select a helpline if needed", styles['NumberedStep']))
    story.append(Paragraph("5. Press the green <b>Call</b> button to start the call", styles['NumberedStep']))
    story.append(Paragraph("6. Use <b>Mute</b> or <b>End Call</b> buttons during the call", styles['NumberedStep']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>IVR Dialer has 3 tabs:</b>", styles['Body']))
    story.append(Paragraph("• <b>Keypad</b> - Enter numbers directly using the on-screen keypad", styles['BulletItem']))
    story.append(Paragraph("• <b>Helplines</b> - Access saved carrier helpline numbers", styles['BulletItem']))
    story.append(Paragraph("• <b>History</b> - View and redial from your call history", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>Helplines Tab:</b>", styles['SectionHeader']))
    story.append(Paragraph(
        "Click the <b>Helplines</b> tab to see saved carrier numbers for quick dialing:",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'ivr-helplines.png'), 
              "Figure 1.3: IVR Dialer - Helplines Tab with saved carrier numbers")
    
    story.append(Paragraph("• <b>Saved Helplines</b> - Pre-configured numbers like DirecTV, Dish, etc.", styles['BulletItem']))
    story.append(Paragraph("• <b>+ Add New Number</b> - Save your own frequently used numbers", styles['BulletItem']))
    story.append(Paragraph("• <b>Dial Button</b> - Click to instantly call any saved helpline", styles['BulletItem']))
    story.append(Paragraph("• <b>Edit/Delete</b> - Manage your saved numbers", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>History Tab:</b>", styles['SectionHeader']))
    story.append(Paragraph(
        "Click the <b>History</b> tab to see your recent IVR calls and redial:",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'ivr-history.png'), 
              "Figure 1.4: IVR Dialer - History Tab showing recent calls")
    
    story.append(Paragraph("• <b>Call Status</b> - See if calls were Completed, Missed, etc.", styles['BulletItem']))
    story.append(Paragraph("• <b>Phone Number</b> - The number that was called", styles['BulletItem']))
    story.append(Paragraph("• <b>Duration</b> - How long the call lasted", styles['BulletItem']))
    story.append(Paragraph("• <b>Date & Time</b> - When the call was made", styles['BulletItem']))
    story.append(Paragraph("• <b>Call Icon</b> - Click to redial the number directly from history", styles['BulletItem']))
    story.append(Paragraph("• <b>View All Calls</b> - See complete IVR call history", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Tip:</b> Use the Helplines tab to quickly call carrier support (Dish, DirecTV) without memorizing numbers!",
        styles['Tip']
    ))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 2: DASHBOARD =====
    story.append(Paragraph("2. Your Dashboard", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Dashboard is your home base. Here you'll see your appointments, sales, and quick actions.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'dashboard.png'), 
              "Figure 2.1: Dashboard Overview")
    
    story.append(Paragraph("2.1 Appointments Summary", styles['SectionHeader']))
    story.append(Paragraph(
        "At the top of your dashboard, you'll see your appointment summary:",
        styles['Body']
    ))
    story.append(Paragraph("• <b>Today's Appointments</b> - Number of callbacks scheduled for today", styles['BulletItem']))
    story.append(Paragraph("• <b>Upcoming</b> - Total upcoming appointments", styles['BulletItem']))
    story.append(Paragraph("• <b>Next Appointment</b> - Your next scheduled callback", styles['BulletItem']))
    
    story.append(Paragraph("2.2 Sales Table", styles['SectionHeader']))
    story.append(Paragraph(
        "The Sales Management table shows all your sales with columns for ID, Status, Customer Name, Landline No, Cell No, Created date, Updated date, Tags, and Actions.",
        styles['Body']
    ))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("2.3 Filtering Sales", styles['SectionHeader']))
    story.append(Paragraph("Use the filter bar to find specific sales:", styles['Body']))
    story.append(Paragraph("• <b>Date filters:</b> Today, Yesterday, By Month, Custom range", styles['BulletItem']))
    story.append(Paragraph("• <b>Status filter:</b> Filter by Lead, Appointment, Sale Done, etc.", styles['BulletItem']))
    story.append(Paragraph("• <b>Search:</b> Search by phone number", styles['BulletItem']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 3: DIALING =====
    story.append(Paragraph("3. Making Calls (Dialing)", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Dialing page is where you make outbound calls and track your call history.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'dialing.png'), 
              "Figure 3.1: Dialing Page")
    
    story.append(Paragraph("3.1 Lead Dialing Tab", styles['SectionHeader']))
    story.append(Paragraph(
        "Use Lead Dialing for structured cold calls with state/city tracking:",
        styles['Body']
    ))
    story.append(Paragraph("1. Select the <b>State</b> you're calling", styles['NumberedStep']))
    story.append(Paragraph("2. Select the <b>City or Zipcode</b>", styles['NumberedStep']))
    story.append(Paragraph("3. Enter the <b>Purpose</b> of your call", styles['NumberedStep']))
    story.append(Paragraph("4. Enter the <b>Phone Number</b>", styles['NumberedStep']))
    story.append(Paragraph("5. Click the <b>Call</b> button", styles['NumberedStep']))
    
    story.append(Paragraph(
        "<b>Tip:</b> The system automatically records call duration and outcome for your reports!",
        styles['Tip']
    ))
    
    story.append(Paragraph("3.2 Quick Dial Tab", styles['SectionHeader']))
    story.append(Paragraph(
        "Use Quick Dial when you just need to make a call without location tracking:",
        styles['Body']
    ))
    story.append(Paragraph("• Enter customer name (optional)", styles['BulletItem']))
    story.append(Paragraph("• Enter phone number", styles['BulletItem']))
    story.append(Paragraph("• Add purpose and notes", styles['BulletItem']))
    story.append(Paragraph("• Click Call", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>During an Active Call:</b>", styles['SectionHeader']))
    story.append(Paragraph(
        "When you're on a call, an <b>Active Call</b> panel appears on the right side with call controls:",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'dialing-active-call.png'), 
              "Figure 3.2: Active Call Panel - Create Sale while on call")
    
    story.append(Paragraph("<b>Active Call Panel Features:</b>", styles['Body']))
    story.append(Paragraph("• <b>Call Status</b> - Shows 'In Progress' with call duration timer", styles['BulletItem']))
    story.append(Paragraph("• <b>Call Connected</b> - Green indicator when call is connected", styles['BulletItem']))
    story.append(Paragraph("• <b>Create Sale</b> - Click to create a new sale for this customer", styles['BulletItem']))
    story.append(Paragraph("• <b>Participants</b> - Shows Agent (You) and Customer connection status", styles['BulletItem']))
    story.append(Paragraph("• <b>Mute</b> - Mute your microphone", styles['BulletItem']))
    story.append(Paragraph("• <b>Start Recording</b> - Record the call", styles['BulletItem']))
    story.append(Paragraph("• <b>Show Keypad</b> - Open keypad for IVR navigation", styles['BulletItem']))
    story.append(Paragraph("• <b>End Call</b> - Hang up the call", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Tip:</b> Click 'Create Sale' during the call to open the sale form with the customer's number pre-filled!",
        styles['Tip']
    ))
    
    story.append(Paragraph("3.3 Check Number Tab", styles['SectionHeader']))
    story.append(Paragraph(
        "Before creating a new sale, always check if the number exists:",
        styles['Body']
    ))
    story.append(Paragraph("• Enter the phone number and click <b>Check</b>", styles['BulletItem']))
    story.append(Paragraph("• If found, you'll see the customer's history", styles['BulletItem']))
    story.append(Paragraph("• This prevents duplicate customers!", styles['BulletItem']))
    
    story.append(Paragraph("3.4 Call History", styles['SectionHeader']))
    story.append(Paragraph(
        "Below the tabs, you'll find your complete call history with:",
        styles['Body']
    ))
    story.append(Paragraph("• Call status (Connected, No Answer, Voicemail)", styles['BulletItem']))
    story.append(Paragraph("• Date, duration, and notes", styles['BulletItem']))
    story.append(Paragraph("• Actions: Call Again, Create Sale, Add Note", styles['BulletItem']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 4: MANAGING SALES =====
    story.append(Paragraph("4. Managing Sales", styles['ChapterTitle']))
    
    story.append(Paragraph("4.1 Creating a New Sale", styles['SectionHeader']))
    story.append(Paragraph(
        "You can create a sale by clicking <b>+ New Sale</b> in the navbar, or by clicking <b>Create Sale</b> during an active call.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'add-new-sale.png'), 
              "Figure 4.1: Add New Sale Page")
    
    story.append(Paragraph("<b>The Add New Sale page shows:</b>", styles['Body']))
    story.append(Paragraph("• <b>Status Buttons</b> - Hangup, No Response, Voicemail, Appointment, Lead Call, Sale Done", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Information</b> - Name, Landline, Cell Number, Address", styles['BulletItem']))
    story.append(Paragraph("• <b>Last Sale Info</b> - Shows previous sale details for this number", styles['BulletItem']))
    story.append(Paragraph("• <b>Download DOC</b> - Download sale document", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>Customer Already Exists Check:</b>", styles['SectionHeader']))
    story.append(Paragraph(
        "When you click a sale action button, the system checks if the customer already exists:",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'customer-exists-popup.png'), 
              "Figure 4.2: Customer Already Exists Popup")
    
    story.append(Paragraph("<b>If a matching customer is found:</b>", styles['Body']))
    story.append(Paragraph("• <b>Exact Match</b> - Shows customer with same name and landline (highlighted in green)", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Details</b> - Shows ID, creation date, last sale info", styles['BulletItem']))
    story.append(Paragraph("• <b>Select Existing</b> - Click the green highlighted customer to use existing record", styles['BulletItem']))
    story.append(Paragraph("• <b>Create New Customer</b> - Click to create a new customer instead", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Important:</b> Always check if customer exists to avoid duplicate records! Select the existing customer when possible.",
        styles['Warning']
    ))
    
    story.append(Paragraph("<b>Customer Information to collect:</b>", styles['Body']))
    story.append(Paragraph("• <b>Name</b> (required)", styles['BulletItem']))
    story.append(Paragraph("• <b>Landline Number</b> - Auto-filled from call", styles['BulletItem']))
    story.append(Paragraph("• <b>Cell Number</b>", styles['BulletItem']))
    story.append(Paragraph("• <b>I spoke to</b> - Name of person you spoke with", styles['BulletItem']))
    story.append(Paragraph("• <b>Physical/Service Address</b>", styles['BulletItem']))
    
    story.append(Paragraph("4.2 Sale Status Workflow", styles['SectionHeader']))
    story.append(Paragraph(
        "Sales progress through different statuses:",
        styles['Body']
    ))
    
    workflow_data = [
        ['Stage', 'What Happens'],
        ['Lead', 'New customer, first contact'],
        ['Voicemail/No Response', 'Couldn\'t reach customer'],
        ['Appointment', 'Scheduled a callback'],
        ['Sale Done', 'Sale completed successfully'],
        ['Active', 'Being processed (verification/payment)'],
    ]
    
    workflow_table = Table(workflow_data, colWidths=[2*inch, 4*inch])
    workflow_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('GRID', (0, 0), (-1, -1), 1, grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, LIGHT]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(workflow_table)
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("4.3 Adding Payment Info", styles['SectionHeader']))
    story.append(Paragraph(
        "When a sale is ready for payment, scroll down to the <b>Payment Information</b> section. You can add multiple payment methods using different tabs:",
        styles['Body']
    ))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>1. Credit/Debit Card:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'payment-card.png'), 
              "Figure 4.3: Payment - Credit/Debit Card Tab")
    
    story.append(Paragraph("• <b>Card Type</b> - Select Visa, MasterCard, Amex, etc.", styles['BulletItem']))
    story.append(Paragraph("• <b>Provider</b> - Select payment provider", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Name</b> - Name on card", styles['BulletItem']))
    story.append(Paragraph("• <b>Card Number</b> - Full card number", styles['BulletItem']))
    story.append(Paragraph("• <b>CVV</b> - 3 or 4 digit security code", styles['BulletItem']))
    story.append(Paragraph("• <b>Card Expiry Date</b> - MM/YY format", styles['BulletItem']))
    story.append(Paragraph("• <b>Notes</b> - Any additional notes", styles['BulletItem']))
    story.append(Paragraph("• Click <b>Add Card Detail</b> to save", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>2. Bank Account:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'payment-bank.png'), 
              "Figure 4.4: Payment - Bank Account Tab")
    
    story.append(Paragraph("• <b>Bank Name</b> - Name of the bank", styles['BulletItem']))
    story.append(Paragraph("• <b>Account Holder</b> - Name on account", styles['BulletItem']))
    story.append(Paragraph("• <b>Account #</b> - Account number (8-17 digits)", styles['BulletItem']))
    story.append(Paragraph("• <b>Routing #</b> - Routing number (9 digits)", styles['BulletItem']))
    story.append(Paragraph("• <b>Check #</b> - Check number (3-10 digits)", styles['BulletItem']))
    story.append(Paragraph("• <b>Driver License</b> - License number (5-20 characters)", styles['BulletItem']))
    story.append(Paragraph("• <b>Name on License</b> - Name as shown on license", styles['BulletItem']))
    story.append(Paragraph("• <b>State ID</b> - State identification", styles['BulletItem']))
    story.append(Paragraph("• Click <b>Add Bank Detail</b> to save", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>3. Cheque to Mail:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'payment-cheque.png'), 
              "Figure 4.5: Payment - Cheque to Mail Tab")
    
    story.append(Paragraph("• <b>Cheque Number</b> - Check number", styles['BulletItem']))
    story.append(Paragraph("• <b>Name on Cheque</b> - Name printed on check", styles['BulletItem']))
    story.append(Paragraph("• <b>Bank Name</b> - Issuing bank", styles['BulletItem']))
    story.append(Paragraph("• <b>Notes</b> - Additional details", styles['BulletItem']))
    story.append(Paragraph("• Click <b>Add Cheque to Mail</b> to save", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>4. Email Invoice:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'payment-email.png'), 
              "Figure 4.6: Payment - Email Invoice Tab")
    
    story.append(Paragraph("• <b>Email Address</b> - Customer's email for invoice", styles['BulletItem']))
    story.append(Paragraph("• <b>Notes</b> - Any additional information", styles['BulletItem']))
    story.append(Paragraph("• Click <b>Add Payment Email</b> to save", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Important:</b> Always verify payment information with the customer before submitting! Double-check card numbers and account details.",
        styles['Warning']
    ))
    
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("4.4 Adding Notes to Sales", styles['SectionHeader']))
    story.append(Paragraph(
        "Add notes to track important information about a sale. Notes can include appointments and comments.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'add-note-popup.png'), 
              "Figure 4.7: Add Note Popup with Appointment")
    
    story.append(Paragraph("<b>Add Note features:</b>", styles['Body']))
    story.append(Paragraph("• <b>Customer's State</b> - Shows customer's timezone (e.g., AL - CDT)", styles['BulletItem']))
    story.append(Paragraph("• <b>Appointment Date</b> - Optional - set a callback date", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer's Local Time</b> - Enter time in customer's timezone", styles['BulletItem']))
    story.append(Paragraph("• <b>Your Time</b> - Shows converted time in your timezone (e.g., Pakistan Time)", styles['BulletItem']))
    story.append(Paragraph("• <b>Note</b> - Write your note (up to 500 characters)", styles['BulletItem']))
    story.append(Paragraph("• Click <b>Add Note</b> to save", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Tip:</b> When setting appointments, enter the time in customer's timezone - the system automatically converts it to your time!",
        styles['Tip']
    ))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>Notes Section:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'notes-section.png'), 
              "Figure 4.8: Notes Section showing saved notes")
    
    story.append(Paragraph("Each note displays:", styles['Body']))
    story.append(Paragraph("• <b>Date & Time</b> - When the note was created", styles['BulletItem']))
    story.append(Paragraph("• <b>Note Content</b> - Your note text", styles['BulletItem']))
    story.append(Paragraph("• <b>Appointment Link</b> - If appointment was set, shows date/time", styles['BulletItem']))
    story.append(Paragraph("• <b>Agent Name</b> - Who created the note", styles['BulletItem']))
    story.append(Paragraph("• <b>Edit</b> - Modify the note", styles['BulletItem']))
    story.append(Paragraph("• <b>Comment</b> - Add comments to the note", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>Adding Comments to Notes:</b>", styles['Body']))
    
    add_image(story, os.path.join(screenshots_dir, 'notes-with-comments.png'), 
              "Figure 4.9: Notes with Comments expanded")
    
    story.append(Paragraph("• Click <b>Comment</b> button to add a comment to any note", styles['BulletItem']))
    story.append(Paragraph("• Comments show date, time, and who made the comment", styles['BulletItem']))
    story.append(Paragraph("• Great for team communication about a sale", styles['BulletItem']))
    story.append(Paragraph("• Supervisors and admins can add comments to agent notes", styles['BulletItem']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 5: CUSTOMERS =====
    story.append(Paragraph("5. Customers", styles['ChapterTitle']))
    story.append(Paragraph(
        "The Customers page shows all customers you've worked with.",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'customers.png'), 
              "Figure 5.1: Customers Page")
    
    story.append(Paragraph("<b>Each customer card shows:</b>", styles['Body']))
    story.append(Paragraph("• Customer name and contact info", styles['BulletItem']))
    story.append(Paragraph("• Location (State, City)", styles['BulletItem']))
    story.append(Paragraph("• Related sales with status badges", styles['BulletItem']))
    story.append(Paragraph("• Click any sale to view/edit it", styles['BulletItem']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 6: APPOINTMENTS =====
    story.append(Paragraph("6. Appointments", styles['ChapterTitle']))
    story.append(Paragraph(
        "Track all your scheduled callbacks. Appointments are shown on your dashboard and in the dedicated Appointments page.",
        styles['Body']
    ))
    
    story.append(Paragraph("<b>Dashboard Appointments Summary:</b>", styles['SectionHeader']))
    story.append(Paragraph(
        "Your dashboard shows appointment summary at the top:",
        styles['Body']
    ))
    
    add_image(story, os.path.join(screenshots_dir, 'dashboard-appointments.png'), 
              "Figure 6.1: Dashboard with Appointments Summary and Sales Table")
    
    story.append(Paragraph("<b>Appointments Summary shows:</b>", styles['Body']))
    story.append(Paragraph("• <b>Today's Appointments</b> - Number of callbacks for today", styles['BulletItem']))
    story.append(Paragraph("• <b>Upcoming</b> - Total upcoming appointments count", styles['BulletItem']))
    story.append(Paragraph("• <b>Next Appointment</b> - Customer name and both timezones:", styles['BulletItem']))
    story.append(Paragraph("  - Customer (CDT): Time in customer's timezone", styles['BulletItem']))
    story.append(Paragraph("  - Pakistan (PKT): Time in your timezone", styles['BulletItem']))
    story.append(Paragraph("• Click <b>View All →</b> to see all appointments", styles['BulletItem']))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>All Appointments Page:</b>", styles['SectionHeader']))
    
    add_image(story, os.path.join(screenshots_dir, 'appointments.png'), 
              "Figure 6.2: All Appointments Page")
    
    story.append(Paragraph("<b>Filter appointments by:</b>", styles['Body']))
    story.append(Paragraph("• <b>View Users</b> - Select specific agent or All Users", styles['BulletItem']))
    story.append(Paragraph("• <b>Filter</b> - Upcoming Appointments, Today, Past", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Each appointment card shows:</b>", styles['Body']))
    story.append(Paragraph("• <b>Customer Name</b> with status badge (Upcoming/Today/Past)", styles['BulletItem']))
    story.append(Paragraph("• <b>Customer Time (CDT)</b> - Time in customer's timezone", styles['BulletItem']))
    story.append(Paragraph("• <b>Your Time (PKT)</b> - Time converted to your timezone", styles['BulletItem']))
    story.append(Paragraph("• <b>Agent</b> - Which agent has this appointment", styles['BulletItem']))
    story.append(Paragraph("• <b>View Sale</b> - Click to open the related sale", styles['BulletItem']))
    
    story.append(Paragraph(
        "<b>Tip:</b> The system automatically converts appointment times between customer's timezone and yours - no manual calculation needed!",
        styles['Tip']
    ))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 7: FOR SUPERVISORS =====
    story.append(Paragraph("7. For Supervisors", styles['ChapterTitle']))
    story.append(Paragraph(
        "As a supervisor, you have additional capabilities to manage your team.",
        styles['Body']
    ))
    
    story.append(Paragraph("<b>Supervisor Features:</b>", styles['SectionHeader']))
    story.append(Paragraph("• View sales from your supervised agents", styles['BulletItem']))
    story.append(Paragraph("• Filter dashboard by agent", styles['BulletItem']))
    story.append(Paragraph("• View team appointments", styles['BulletItem']))
    story.append(Paragraph("• Toggle between your sales and team sales", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>To view team sales:</b>", styles['Body']))
    story.append(Paragraph("1. Go to your Dashboard", styles['NumberedStep']))
    story.append(Paragraph("2. Use the <b>User dropdown</b> to select an agent", styles['NumberedStep']))
    story.append(Paragraph("3. Or toggle <b>My Appointments</b> to see team appointments", styles['NumberedStep']))
    
    story.append(PageBreak())
    
    # ===== CHAPTER 8: TIPS & TROUBLESHOOTING =====
    story.append(Paragraph("8. Tips & Troubleshooting", styles['ChapterTitle']))
    
    story.append(Paragraph("Quick Tips for Success", styles['SectionHeader']))
    story.append(Paragraph("• Always <b>Check Number</b> before creating a new sale", styles['BulletItem']))
    story.append(Paragraph("• Add <b>notes</b> to calls for future reference", styles['BulletItem']))
    story.append(Paragraph("• Schedule <b>appointments</b> in the customer's timezone", styles['BulletItem']))
    story.append(Paragraph("• Update sale <b>status</b> promptly", styles['BulletItem']))
    story.append(Paragraph("• Check <b>notifications</b> regularly for updates", styles['BulletItem']))
    story.append(Spacer(1, 0.2*inch))
    
    story.append(Paragraph("Common Issues", styles['SectionHeader']))
    
    story.append(Paragraph("<b>Can't sign in?</b>", styles['Body']))
    story.append(Paragraph("• Check your email and password", styles['BulletItem']))
    story.append(Paragraph("• Enable location permission", styles['BulletItem']))
    story.append(Paragraph("• Contact your supervisor for password reset", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Calls not working?</b>", styles['Body']))
    story.append(Paragraph("• Allow microphone access in browser", styles['BulletItem']))
    story.append(Paragraph("• Check your internet connection", styles['BulletItem']))
    story.append(Paragraph("• Ensure Twilio is enabled (ask admin)", styles['BulletItem']))
    story.append(Spacer(1, 0.1*inch))
    
    story.append(Paragraph("<b>Session expired?</b>", styles['Body']))
    story.append(Paragraph("• This happens after inactivity - just sign in again", styles['BulletItem']))
    story.append(Paragraph("• You may have signed in from another device", styles['BulletItem']))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph(
        "Need more help? Contact your supervisor or system administrator.",
        styles['Body']
    ))
    
    # Build the PDF
    doc.build(story)
    print(f"\n✅ User guide generated successfully!")
    print(f"📁 Location: {output_file}")
    return output_file

if __name__ == "__main__":
    generate_pdf()
