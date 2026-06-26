# PanchitaFit — Setup

## Requisitos
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- App **Expo Go** en tu teléfono (iOS o Android)

## Instalar y correr

```bash
# 1. Entrar a la carpeta
cd panchita-fit

# 2. Instalar dependencias
npm install

# 3. Correr el app
npx expo start
```

Escaneás el QR con Expo Go y el app corre en tu teléfono.

## Estructura de archivos

```
panchita-fit/
├── App.js                  # Navegación principal + onboarding gate
├── app.json                # Config de Expo
├── package.json
├── babel.config.js
├── constants/
│   └── theme.js            # Colores, fonts, radios
├── storage/
│   └── index.js            # AsyncStorage wrapper
├── screens/
│   ├── HomeScreen.js       # Dashboard + insight Panchita
│   ├── WorkoutScreen.js    # Log de ejercicios
│   ├── CoachScreen.js      # Chat con Panchita
│   └── OnboardScreen.js    # Flujo primera vez
└── assets/
    └── panchita-neutral.png    # (agregar cuando tengas las imágenes)
    └── panchita-happy.png
    └── panchita-angry.png
```

## Agregar las imágenes de Panchita

1. Guardá los 3 PNGs de ChatGPT en la carpeta `assets/`
2. En `CoachScreen.js`, reemplazá el emoji `🐾` por:
   ```jsx
   import { Image } from 'react-native';
   // ...
   <Image source={require('../assets/panchita-neutral.png')} style={{ width: 50, height: 50 }} />
   ```
3. Para la celebración, usá `panchita-happy.png` cuando `justCompleted === true`

## Próximos pasos (Firebase)
Cuando quieras sincronizar entre dispositivos, avisame y te guío para conectar Firebase Auth + Firestore. El código de storage está diseñado para que el cambio sea mínimo.
