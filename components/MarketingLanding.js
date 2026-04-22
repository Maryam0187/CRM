'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function MarketingLanding() {
  const [activeDemo, setActiveDemo] = useState('dashboard');
  const keyHighlights = [
    {
      title: 'VoIP Calling Built In',
      detail: 'Handle inbound and outbound calls directly inside the CRM without switching tools.'
    },
    {
      title: 'Twilio Integration',
      detail: 'Use Twilio-powered telephony for reliable call workflows and scalable communication.'
    },
    {
      title: 'Conference Calls',
      detail: 'Bring agents, managers, and clients together quickly with built-in conference support.'
    },
    {
      title: 'Call Recording',
      detail: 'Record and review calls for quality checks, training, and better follow-up.'
    },
    {
      title: 'Modern, Clean UI',
      detail: 'A simple interface designed for fast onboarding and efficient day-to-day execution.'
    },
    {
      title: 'Sales Management',
      detail: 'Track leads, activities, pipeline, and outcomes in one centralized platform.'
    },
    {
      title: 'Admin, Supervisor & Agent Roles',
      detail: 'Role-based access gives each team member the right tools and permissions based on responsibility.'
    }
  ];

  const features = [
    {
      icon: '📊',
      title: 'Advanced Dashboard',
      description: 'Real-time analytics and KPIs to track your sales performance at a glance.',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: '📞',
      title: 'Integrated Voice Calling',
      description: 'Make and receive calls directly from your browser with Twilio integration. No phone needed!',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: '👥',
      title: 'Customer Management',
      description: 'Comprehensive customer database with detailed profiles, history, and interaction tracking.',
      color: 'from-purple-500 to-pink-500'
    },
    {
      icon: '💰',
      title: 'Sales Pipeline',
      description: 'Track leads from initial contact to closed deals with customizable sales stages.',
      color: 'from-orange-500 to-red-500'
    },
    {
      icon: '📅',
      title: 'Appointment Scheduling',
      description: 'Schedule and manage appointments with automatic reminders and calendar integration.',
      color: 'from-indigo-500 to-blue-500'
    },
    {
      icon: '💳',
      title: 'Payment Tracking',
      description: 'Track payments, manage billing information, and monitor financial transactions.',
      color: 'from-teal-500 to-cyan-500'
    },
    {
      icon: '🔔',
      title: 'Real-time Notifications',
      description: 'Get instant notifications for important events, calls, and updates via Socket.IO.',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      icon: '📝',
      title: 'Call Recording & Logs',
      description: 'Automatically record calls and maintain detailed logs for compliance and training.',
      color: 'from-red-500 to-pink-500'
    },
    {
      icon: '🔄',
      title: 'Call Transfers',
      description: 'Seamlessly transfer calls between agents with warm and cold transfer options.',
      color: 'from-violet-500 to-purple-500'
    },
    {
      icon: '👨‍💼',
      title: 'Supervisor Tools',
      description: 'Monitor agent performance, manage teams, and oversee operations in real-time.',
      color: 'from-cyan-500 to-blue-500'
    },
    {
      icon: '⏱️',
      title: 'Time & Activity Tracking',
      description: 'Track agent activity, work hours, and productivity metrics automatically.',
      color: 'from-emerald-500 to-green-500'
    },
    {
      icon: '🔐',
      title: 'Role-Based Access',
      description: 'Secure access control with dedicated Admin, Supervisor, and Agent permissions.',
      color: 'from-slate-500 to-gray-500'
    }
  ];

  const demoSections = [
    {
      id: 'dashboard',
      title: 'Dashboard Overview',
      description: 'Get a comprehensive view of your sales performance with real-time metrics and analytics.',
      image: '📊',
      features: ['Real-time KPIs', 'Sales Statistics', 'Activity Feed', 'Performance Metrics']
    },
    {
      id: 'calling',
      title: 'Web-Based Calling',
      description: 'Make and receive calls directly from your browser with full call management features.',
      image: '📞',
      features: ['Browser-Based Calls', 'Call Recording', 'Call Transfers', 'Conference Calls']
    },
    {
      id: 'customers',
      title: 'Customer Management',
      description: 'Manage your entire customer database with detailed profiles and interaction history.',
      image: '👥',
      features: ['Customer Profiles', 'Interaction History', 'Lead Tracking', 'Status Management']
    },
    {
      id: 'sales',
      title: 'Sales Pipeline',
      description: 'Track your sales from initial lead to closed deal with customizable workflows.',
      image: '💰',
      features: ['Lead Management', 'Deal Tracking', 'Sales Stages', 'Revenue Analytics']
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Link href="/marketing" className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    SalesCRM
                  </span>
                </Link>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 hover:text-blue-600 transition">Features</a>
              <a href="#demo" className="text-gray-700 hover:text-blue-600 transition">Demo</a>
              <a href="#benefits" className="text-gray-700 hover:text-blue-600 transition">Benefits</a>
              <Link href="/signin" className="text-gray-700 hover:text-blue-600 transition">Sign In</Link>
              <Link href="/signin" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all">
                Get Started
              </Link>
            </div>
            <div className="md:hidden">
              <Link href="/signin" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6">
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Powerful CRM
              </span>
              <br />
              <span className="text-gray-800">for Modern Sales Teams</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Built to help sales teams communicate faster and close more deals with
              integrated VoIP, Twilio, conference calling, recordings, and streamlined sales workflows.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/signin"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-300"
              >
                Book a Demo
              </Link>
              <a
                href="#contact"
                className="bg-white text-gray-800 px-8 py-4 rounded-xl text-lg font-semibold border-2 border-gray-300 hover:border-blue-600 hover:shadow-lg transition-all duration-300"
              >
                Contact Me
              </a>
            </div>
            <div className="mt-12 flex justify-center items-center space-x-8 text-gray-600">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">100%</div>
                <div className="text-sm">Browser-Based</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">24/7</div>
                <div className="text-sm">Support</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">99.9%</div>
                <div className="text-sm">Uptime</div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>
      </section>

      {/* Key Highlights Section */}
      <section className="py-20 bg-gradient-to-b from-white to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Key <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Highlights</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              The exact features businesses ask for when they want one CRM for communication and sales growth.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {keyHighlights.map((highlight) => (
              <div
                key={highlight.title}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow duration-300"
              >
                <h3 className="text-xl font-bold text-gray-900 mb-3">{highlight.title}</h3>
                <p className="text-gray-600">{highlight.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Everything You Need to <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Succeed</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed to streamline your sales process and boost productivity
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white p-6 rounded-2xl border border-gray-200 hover:border-transparent hover:shadow-2xl transition-all duration-300"
              >
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${feature.color} flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
                <div className={`absolute inset-0 bg-gradient-to-r ${feature.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`}></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              See It In <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Action</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Explore our interactive demo and discover how easy it is to manage your sales
            </p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Demo Tabs */}
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="flex flex-wrap">
                {demoSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveDemo(section.id)}
                    className={`flex-1 min-w-[150px] px-6 py-4 text-center font-semibold transition-all ${
                      activeDemo === section.id
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Demo Content */}
            <div className="p-8 md:p-12">
              {demoSections.map((section) => (
                <div
                  key={section.id}
                  className={`${activeDemo === section.id ? 'block' : 'hidden'} animate-fadeIn`}
                >
                  <div className="grid md:grid-cols-2 gap-8 items-center">
                    <div>
                      <div className="text-6xl mb-4">{section.image}</div>
                      <h3 className="text-3xl font-bold text-gray-900 mb-4">{section.title}</h3>
                      <p className="text-lg text-gray-600 mb-6">{section.description}</p>
                      <ul className="space-y-3">
                        {section.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center text-gray-700">
                            <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/signin"
                        className="inline-block mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
                      >
                        Try It Now →
                      </Link>
                    </div>
                    <div className="relative">
                      <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl p-8 shadow-inner">
                        <div className="bg-white rounded-lg shadow-lg p-6">
                          <div className="space-y-4">
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            <div className="grid grid-cols-3 gap-4 mt-6">
                              <div className="bg-blue-50 rounded p-4">
                                <div className="h-8 bg-blue-200 rounded mb-2"></div>
                                <div className="h-4 bg-blue-100 rounded"></div>
                              </div>
                              <div className="bg-indigo-50 rounded p-4">
                                <div className="h-8 bg-indigo-200 rounded mb-2"></div>
                                <div className="h-4 bg-indigo-100 rounded"></div>
                              </div>
                              <div className="bg-purple-50 rounded p-4">
                                <div className="h-8 bg-purple-200 rounded mb-2"></div>
                                <div className="h-4 bg-purple-100 rounded"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full opacity-20 blur-2xl"></div>
                      <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-br from-blue-400 to-indigo-400 rounded-full opacity-20 blur-2xl"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Why Choose <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">SalesCRM</span>?
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Lightning Fast</h3>
              <p className="text-gray-600">
                Built with Next.js and optimized for performance. Experience blazing-fast load times and smooth interactions.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔒</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Secure & Reliable</h3>
              <p className="text-gray-600">
                Enterprise-grade security with JWT authentication, role-based access control, and encrypted data storage.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Fully Responsive</h3>
              <p className="text-gray-600">
                Works seamlessly on desktop, tablet, and mobile devices. Access your CRM from anywhere, anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Looking for a CRM Like This?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            If you want this kind of CRM for your business, approach me directly.
            I am available to discuss your requirements and demo the full workflow.
          </p>
          <p className="text-blue-100 mb-8">
            Contact us at{' '}
            <a
              href="mailto:INFO@itechsoft.net"
              className="font-semibold text-white underline underline-offset-4 hover:text-blue-200 transition-colors"
            >
              INFO@itechsoft.net
            </a>
          </p>
          <p className="text-blue-100 mb-8">
            Need product walkthrough details? Open the{' '}
            <a
              href="/docs/agent-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline underline-offset-4 hover:text-blue-200 transition-colors"
            >
              User Guide
            </a>
            .
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signin"
              className="bg-white text-blue-600 px-8 py-4 rounded-xl text-lg font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-300"
            >
              Start With a Demo
            </Link>
            <a
              href="#demo"
              className="bg-blue-500/20 backdrop-blur-sm text-white border-2 border-white/30 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-500/30 transition-all duration-300"
            >
              View Product Walkthrough
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-900 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-white">SalesCRM</div>
              </div>
              <p className="text-gray-400">
                The modern CRM solution for sales teams who want to grow faster.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#demo" className="hover:text-white transition">Demo</a></li>
                <li><a href="#benefits" className="hover:text-white transition">Benefits</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
                <li><a href="#" className="hover:text-white transition">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms</a></li>
                <li><a href="#" className="hover:text-white transition">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} SalesCRM. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-in;
        }
      `}</style>
    </div>
  );
}

