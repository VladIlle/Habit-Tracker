# [cite_start]HabitFlow [cite: 1]

[cite_start]HabitFlow este o aplicație web full-stack pentru urmărirea obiceiurilor personale, dotată cu o rețea socială, sistem de prietenii, moderare și criptare a datelor. [cite: 2]

## Caracteristici Principale
* [cite_start]**Gestionare Obiceiuri:** Utilizatorii își pot crea obiceiuri cu frecvențe configurabile (zilnic, de N ori/zi, săptămânal, etc.) și pot monitoriza progresul. 
* [cite_start]**Calendar Interactiv:** Un grid lunar cu navigare care afișează zilele cu completări parțiale (verde) sau complete (auriu), detaliind obiceiurile la click. 
* [cite_start]**Rețea Socială:** Aplicația oferă un feed public cu obiceiurile tuturor utilizatorilor, posibilitatea de a da like și un sistem de cereri de prietenie (pending/accepted/declined). 
* [cite_start]**Mesagerie:** Utilizatorii pot trimite mesaje de încurajare (maxim 500 de caractere), care pot fi legate opțional de un anumit obicei. [cite: 6]
* [cite_start]**Panou de Administrare:** Administratorii pot gestiona utilizatorii (inclusiv blocare/deblocare), pot șterge forțat conținutul și pot vizualiza statistici globale și un jurnal de audit. [cite: 4, 6]
* [cite_start]**Securitate:** Datele sensibile (ex. email, conținut mesaje) sunt criptate folosind AES-256-GCM. [cite: 8, 13] [cite_start]Parolele sunt securizate cu bcrypt (factor de cost 12), iar autentificarea se realizează prin JWT valabil 7 zile. 

## [cite_start]Stiva Tehnologică [cite: 10]
* [cite_start]**Frontend:** HTML5, CSS3, JavaScript ES2022 (SPA single-file, fără framework extern). [cite: 11]
* [cite_start]**Backend:** Node.js (v20 LTS) cu Express.js pentru furnizarea unui REST API JSON. [cite: 11]
* [cite_start]**Bază de Date:** PostgreSQL (v15 Alpine) cu extensiile pgcrypto și uuid-ossp, utilizând driver-ul pg cu un pool maxim de 10 conexiuni. [cite: 11]
* [cite_start]**Infrastructură:** Docker Compose v2 pentru 3 servicii (postgres, backend, frontend) și Nginx pentru servirea resurselor statice. [cite: 11]

## Instalare și Rulare
[cite_start]Proiectul este portabil și poate fi implementat cu o singură comandă Docker Compose. [cite: 8]

1. [cite_start]Configurați variabilele de mediu obligatorii[cite: 14]:
   * [cite_start]`DB_PASSWORD`: Parola utilizatorului PostgreSQL. [cite: 15]
   * [cite_start]`JWT_SECRET`: Secret pentru token-uri JWT (minim 32 caractere). [cite: 15]
   * [cite_start]`ENCRYPTION_KEY`: Cheie AES-256 (exact 64 caractere hex). [cite: 15]
   * [cite_start]`ADMIN_PASSWORD`: Parola implicită pentru contul admin. [cite: 15]
2. [cite_start]Rulați comanda pentru prima instalare: `docker compose down -v && docker compose up --build`. [cite: 17, 18] (Atenție: această comandă va șterge datele existente)[cite_start]. [cite: 17]
3. [cite_start]Aplicația poate fi accesată la `http://localhost`. [cite: 23] [cite_start]Contul de administrator implicit folosește `username=admin`. [cite: 23]
