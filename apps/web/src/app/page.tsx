import { Button } from "@3rdeye/ui";

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-24">
            <div className="text-center">
                <h1 className="text-5xl font-bold tracking-tight">
                    🔮 3rd Eye
                </h1>
                <p className="mt-4 text-xl text-gray-500">
                    The Stripe for Agent Experience Optimization
                </p>
                <p className="mt-2 text-gray-400">
                    Automatically configure Chrome&apos;s WebMCP API for any website.
                </p>
            </div>
            <div className="flex gap-4">
                <Button variant="primary">Get Started</Button>
                <Button variant="secondary">Documentation</Button>
            </div>
        </main>
    );
}
