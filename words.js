// =============================================================
//  words.js — Palabras diarias para WORDLE ES
//
//  La validación de intentos ya NO usa una lista local:
//  se consulta la API de Wiktionary en español en tiempo real,
//  que tiene cientos de miles de entradas del español.
//
//  ► CÓMO AÑADIR TUS PROPIAS PALABRAS DIARIAS:
//    1. Añade palabras al array DAILY_WORDS (5 letras, MAYÚSCULAS).
//    2. Ajusta START_DATE a la fecha de la primera palabra.
//    3. ¡Listo! El juego asigna una palabra distinta cada día.
// =============================================================

const START_DATE = "2026-03-01"; // ← Fecha del primer elemento

// Palabras diarias — añade, quita o reordena a tu gusto
const DAILY_WORDS = [
  "CAMPO", "GATOS", "PLAYA", "TABLA", "FLOTA",
  "GLOBO", "LIBRO", "NOCHE", "PARED", "SILLA",
  "BRISA", "CARTA", "DUELO", "FERIA", "GRUTA",
  "HUESO", "JOVEN", "LIMON", "MARCA", "NIEVE",
  "ORDEN", "PATIO", "QUESO", "RATON", "SABOR",
  "TIGRE", "VALOR", "ABEJA", "BANCO", "CACAO",
  "DANZA", "FALDA", "GARZA", "HABLA", "INDIO",
  "MUSGO", "NARIZ", "OLIVA", "PALMA", "RADAR",
  "SALSA", "TECHO", "VAPOR", "YOGUR", "ZARZA",
  "AGUJA", "BARRO", "CASPA", "ENERO", "FAROL",
  "GAMBA", "HIELO", "JAULA", "KIWIS", "LINCE",
  "NOVIO", "OREJA", "PLAZA", "TUNEL", "VIEJO",
  "AMIGA", "CISNE", "DIETA", "GORDO", "ICONO",
  "JUEGO", "LACRA", "MANGA", "MENOR", "MIEDO",
  "MORSA", "NADAR", "NEGRO", "OASIS", "PEDAL",
  "PERLA", "PILAR", "POLVO", "PRISA", "RIGOR",
  "RONCO", "RUBIO", "SABER", "SELVA", "SOLAR",
  "SUAVE", "TALAR", "TIESO", "TORPE", "ULTRA",
  "VELOZ", "VERDE", "VIGOR", "VISTA", "VOCAL",
  // Añade más palabras aquí
];
