// Estilo "Plano técnico" con la marca del Condominio Las Palmas: verde palma y naranjo (los del logo),
// papel cálido y tinta carbón; el rojo queda solo para alertas y errores. La escala "gray" se redefine para que toda la app la tome.
// Portería usa además la familia "faena" (Barlow) sobre fondo oscuro.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
        faena: ['Barlow', '"Segoe UI"', 'system-ui', 'sans-serif'],
        faenacond: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
      },
      colors: {
        white: '#FFFFFF',
        papel: '#F5F3EE',
        tinta: '#26262B',
        marca: '#2E7D32',
        marcaosc: '#1F5C24',
        acento: '#E39B4F',
        peligro: '#D13038',
        peligroosc: '#A8232A',
        gray: {
          50: '#F8F7F4',
          100: '#F0EEE9',
          200: '#E4E1DA',
          300: '#CBC7BE',
          400: '#8F8B82',
          500: '#5F5D58',
          600: '#4A4844',
          700: '#38373A',
          800: '#2E2D31',
          900: '#26262B',
        },
      },
      borderRadius: { sm: '1px', DEFAULT: '2px', md: '2px', lg: '2px', xl: '3px', '2xl': '4px' },
      boxShadow: { sm: 'none', DEFAULT: 'none', md: '0 0 0 1px #26262B', lg: 'none', xl: '0 8px 24px rgba(38,38,43,0.18)' },
    },
  },
};
