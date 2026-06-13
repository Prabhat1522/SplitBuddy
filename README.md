# SplitBuddy: Shared Expenses Management Application

SplitBuddy is a secure, transaction-safe, and production-ready Shared Expenses Management Application (similar to Splitwise) built using React.js, Node.js, Express.js, and a normalized MySQL database.

---

## Technical Stack
- **Frontend**: React.js (Vite), Tailwind CSS (Aesthetic glassmorphism UI), Axios (JWT Interceptor hooks), React Router (Protected workspaces routing).
- **Backend**: Node.js, Express.js (REST APIs, MVC architectural mapping).
- **Database**: MySQL (relational constraints, indices, transaction support via `mysql2` client pools).
- **Auth**: JWT Authentication (JSON Web Tokens stored in headers).

---

## Core Features
1. **Secure Registration & Login**: Hashed passwords (bcryptjs) and bearer token security.
2. **Flexible Group Management**: Custom expense groups with joining/leaving historical audits.
3. **Leaving Group Constraints**: Members cannot leave or be removed unless their net balance is exactly `INR 0.00`.
4. **Multi-Currency Splits**: Stores expenses in original currencies (e.g. USD, EUR, INR) and exchange rates, converting totals to INR. Implements three split types:
   - **Equal Split** (evenly divided, with cent adjustments).
   - **Exact Split** (checks sum matches total).
   - **Percentage Split** (verifies total is 100%).
5. **Greedy Balance Minimizer**: Calculates net balances and utilizes a greedy matching algorithm to reduce settlement transactions.
6. **Robust CSV Auditing Engine**: Processes file rows, validating 12 specific anomalies and recording report/anomaly logs in `import_reports` and `import_anomalies` tables.

---

## Directory Layout
```
splitbuddy/
├── client/                      # React Frontend SPA
│   ├── src/
│   │   ├── components/          # Reusable Navbar, protected routes
│   │   ├── context/             # Global session AuthProvider
│   │   ├── pages/               # 9 Views (Login, Dashboard, CSV upload, etc.)
│   │   └── services/            # Axios API config
│   ├── index.html
│   └── tailwind.config.js
│
└── server/                      # Node/Express API Server
    ├── config/                  # Database connections
    ├── controllers/             # Express route handler files
    ├── database/                # schema.sql initialize tables
    ├── middleware/              # JWT verification, error handling
    ├── routes/                  # API router definitions
    └── utils/                   # Business engines (balances, CSV auditor)
```

---

## Installation & Running Steps

### Prerequisites
- **Node.js** (v20+ recommended)
- **MySQL Server** (v8.0+ recommended)

### 1. Database Configuration
Open [server/.env](file:///c:/Users/Prabhat%20Kumar/OneDrive/Desktop/Placement%20Assignmnt/server/.env) and update the credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=splitbuddy
```

### 2. Startup Backend
On startup, the backend will verify/create the database and run the `schema.sql` setup automatically.
```bash
cd server
npm install
npm run dev
```

### 3. Startup Frontend
```bash
cd client
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
