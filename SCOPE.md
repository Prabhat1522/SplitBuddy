# Project Scope: SplitBuddy Shared Expenses Application

This document outlines the boundaries, constraints, and requirements met by the SplitBuddy application.

---

## 1. Functional Scope

### User Authentication & Sessions
- Secure login and registration.
- Passwords are encrypted using salted bcrypt hashing.
- JWT token expiration (7-day validity).
- User profile verification hook.

### Group & Membership History
- Group creation and description tracking.
- Invite members to groups via email.
- Automatic creation of unregistered placeholder accounts on invitation to avoid blocking E2E workflows.
- Group leaving/removal constraints: Blocked if the member's balance $\neq 0.00$.
- Historic joins/leaves date tracking in `group_members` table.

### Expense & Split Divisions
- Expense creation in original currencies (e.g. USD, EUR, INR) and conversion to INR using exchange rates.
- Equal split (divided among checked participants, with cents remainder adjustment).
- Exact split (verifies total shares sum matches total expense).
- Percentage split (verifies percentages sum to 100%).
- Soft delete support (`deleted_at` timestamp).

### Settlements & Payments
- Record peer-to-peer payment clearings in INR.
- Settlement log activity history.

### Balance Calculation & Simplified Debts
- Real-time aggregate net balance per group member in INR.
- Greedy matching algorithm to minimize transactions (e.g., matching maximum debtor with maximum creditor).

### CSV Upload & Anomaly Audits
- Buffered memory stream parsing.
- Audit checks for 12 specific anomalies.
- Creation of `import_reports` log and logging row errors to `import_anomalies`.
- Automatic translation of settlement expenses into payment records.

---

## 2. Non-Functional Requirements (NFR)
- **Data Integrity**: Database foreign key constraints, unique composite indices, and database transaction rollbacks.
- **Security**: JWT-based protected backend routing. Input sanitization and email validation.
- **Performance**: Single-query groupings for shares fetching, connection pooling.
- **Usability**: Responsive UI with dark-glass panels, form validation alerts, and template download files.

---

## 3. Out of Scope Boundaries
- **Real-Time Payment Gateways**: SplitBuddy is a recorder/ledger app. Real money transfers (UPI/Stripe/PayPal) are out of scope.
- **Automated Email Invites**: Emails are registered immediately in DB; real SMTP email verification or invitation email sends are out of scope.
- **Dynamic Exchange Rate APIs**: Exchange rates are input manually during expense recording or defaulted via CSV audits; automatic external exchange rates fetching is out of scope.
