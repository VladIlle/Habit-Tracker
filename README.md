# HabitFlow

HabitFlow este o aplicație web full-stack pentru monitorizarea obiceiurilor personale, integrând funcționalități de rețea socială, securitate avansată și un panou complet de administrare.

## Caracteristici Principale
* **Gestiune Obiceiuri:** Creare și monitorizare cu 6 tipuri de frecvență (zilnic, de N ori pe zi/săptămână, la X ore/zile). Include opțiuni pentru iconițe, culori și vizibilitate.
* **Calendar Interactiv:** Vizualizare tip grid lunar cu indicatori de progres (verde pentru parțial, auriu pentru complet) și detalii zilnice.
* **Sistem Social:** Feed public cu paginare, funcție de like, sistem de prietenii (cereri cu status pending/accepted) și căutare cu debounce.
* **Comunicare:** Mesagerie între utilizatori (max. 500 caractere) cu inbox, notificări pentru mesaje necitite și posibilitatea de a lega mesajele de un obicei specific.
* **Securitate de Nivel Enterprise:** Criptare AES-256-GCM pentru date sensibile, hashing bcrypt (cost 12) pentru parole și autentificare securizată prin JWT.
* **Panou Admin:** Statistici globale, moderare utilizatori (blocare/deblocare cu motiv), ștergere conținut și jurnal de audit detaliat.

## Specificații Tehnice
* **Frontend:** SPA (Single Page Application) construit cu HTML5, CSS3 și JavaScript ES2022, fără framework-uri externe.
* **Backend:** Node.js și Express.js (REST API JSON).
* **Bază de Date:** PostgreSQL cu extensii pentru UUID și pgcrypto, gestionată prin pool de conexiuni.
* **Infrastructură:** Containerizare completă prin Docker Compose (servicii: postgres, backend, frontend) și server Nginx pentru resurse statice.

## Instalare și Configurare
Aplicația este portabilă și poate fi pornită cu o singură comandă:

1. **Configurare mediu:** Creați variabilele `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` și `ADMIN_PASSWORD`.
2. **Lansare:** ```bash
   docker compose up --build
