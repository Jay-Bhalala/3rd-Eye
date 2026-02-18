import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "3rd Eye — Dashboard",
    description: "Manage your WebMCP tools, view analytics, and configure your sites.",
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
