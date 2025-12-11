import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "../components/ConditionalLayout";
import ToastManager from "../components/ToastManager";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import { SocketProvider } from "../contexts/SocketContext";
import { CallProvider } from "../contexts/CallContext";
import ReduxProvider from "../components/ReduxProvider";
import GlobalWebCallInterface from "../components/GlobalWebCallInterface";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Agent Portal - Sales Performance Dashboard",
  description: "Your personal sales command center. Track your performance, manage your pipeline, and achieve your sales targets with our agent-focused CRM platform.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReduxProvider>
          <AuthProvider>
            <SocketProvider>
              <CallProvider>
                <ToastProvider>
                  <ConditionalLayout>
                    {children}
                  </ConditionalLayout>
                  <ToastManager />
                  <GlobalWebCallInterface />
                </ToastProvider>
              </CallProvider>
            </SocketProvider>
          </AuthProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
