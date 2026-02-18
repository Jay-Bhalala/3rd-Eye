import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                "3rdeye": {
                    50: "#f0f7ff",
                    100: "#e0effe",
                    200: "#b9dffd",
                    300: "#7cc8fc",
                    400: "#36aef8",
                    500: "#0c95e9",
                    600: "#0076c7",
                    700: "#015ea1",
                    800: "#065085",
                    900: "#0b436e",
                    950: "#072b49",
                },
            },
        },
    },
    plugins: [],
};

export default config;
