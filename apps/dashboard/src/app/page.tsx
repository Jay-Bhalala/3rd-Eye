import { Button } from "@3rdeye/ui";

export default function DashboardHome() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-24">
            <div className="text-center">
                <h1 className="text-4xl font-bold tracking-tight">
                    🔮 Dashboard
                </h1>
                <p className="mt-4 text-lg text-gray-500">
                    Manage your sites, scanned tools, and analytics.
                </p>
            </div>
            <div className="flex gap-4">
                <Button variant="primary">Add Site</Button>
                <Button variant="ghost">View Docs</Button>
            </div>
        </main>
    );
}
