import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "3rd Eye — The Stripe for Agent Experience Optimization",
    description:
        "Automatically configure Chrome's WebMCP API for any website. Enable AI agents to interact with your site natively.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
