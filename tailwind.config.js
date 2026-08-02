/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#09090B',
        surface: '#111113',
        card: '#18181B',
        border: 'rgba(255,255,255,0.06)',
        primary: '#FFFFFF',
        secondary: '#A1A1AA',
        muted: '#71717A',
        accent: '#FF4DA6',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      borderRadius: {
        card: '24px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      fontSize: {
        hero: ['32px', { lineHeight: '38px', fontWeight: '700' }],
        section: ['22px', { lineHeight: '28px', fontWeight: '700' }],
        'card-title': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['15px', { lineHeight: '21px', fontWeight: '400' }],
        caption: ['13px', { lineHeight: '17px', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
