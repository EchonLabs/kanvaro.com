/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        /* shadcn/ui semantic tokens — preserved */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Apple HIG system color tokens */
        apple: {
          blue:    "var(--apple-system-blue)",
          green:   "var(--apple-system-green)",
          orange:  "var(--apple-system-orange)",
          red:     "var(--apple-system-red)",
          yellow:  "var(--apple-system-yellow)",
          purple:  "var(--apple-system-purple)",
          gray:    "var(--apple-system-gray)",
          cyan:    "var(--apple-system-cyan)",
          teal:    "var(--apple-system-teal)",
        },
      },
      borderRadius: {
        /* shadcn compatibility — driven by --radius CSS var (14px) */
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* Apple HIG explicit radius tokens */
        "apple-sm":   "var(--apple-radius-sm)",   /* 10px */
        "apple-md":   "var(--apple-radius-md)",   /* 14px */
        "apple-lg":   "var(--apple-radius-lg)",   /* 16px */
        "apple-xl":   "var(--apple-radius-xl)",   /* 20px */
        "apple-pill": "var(--apple-radius-pill)", /* 999px */
      },
      spacing: {
        /* Apple HIG spacing scale (4px base) */
        "apple-1": "4px",
        "apple-2": "8px",
        "apple-3": "12px",
        "apple-4": "16px",
        "apple-5": "20px",
        "apple-6": "24px",
        "apple-8": "32px",
        "apple-toolbar": "44px",
        "apple-nav-row": "32px",
        "apple-sidebar": "256px",
        "apple-sidebar-collapsed": "64px",
      },
      fontFamily: {
        apple: ["Nunito Sans", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        "apple-rounded": ["Nunito Sans", "system-ui", "sans-serif"],
        "apple-mono": ["Nunito Sans", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      transitionDuration: {
        250: "250ms",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
