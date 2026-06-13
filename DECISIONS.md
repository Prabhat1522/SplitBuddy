# Engineering Decisions & Design Tradeoffs: SplitBuddy

This document details the core architectural choices, decisions, and tradeoffs made during the development of SplitBuddy.

---

## 1. Database Tier: Raw SQL Connection Pool (`mysql2`) vs. ORM
- **Decision**: Avoided Sequelize ORM in favor of raw SQL statements executed via `mysql2/promise` connection pool.
- **Rationale**:
  - Direct execution of complex subqueries and aggregates (especially for balance calculations and transactional rollbacks).
  - Simpler debugging and trace logs (crucial for interview demonstrations).
  - Clear separation of relational queries in controller files.
- **Tradeoff**: Increased code size in controllers since model mappings must be handled manually, but this yields complete control over SQL execution plans.

---

## 2. Currency Strategy: Multi-Currency Tracking converted to INR
- **Decision**: Store original amounts, original currencies, and manually input exchange rates, converting all expense costs to INR for calculations.
- **Rationale**:
  - Calculating net balances across multiple active currencies leads to complex situations where User A owes User B USD 10 and User B owes User A EUR 9.
  - Converting all shares to a single base currency (INR) yields a single net balance per user, which can be settled in one step.
  - Retaining `original_amount` and `exchange_rate` in the `expenses` table preserves audit traceability.
- **Tradeoff**: Manually inputting exchange rates places some responsibility on the user, but this is mitigated by defaulting rates (USD = 83.5, EUR = 90.0) during CSV imports.

---

## 3. Decimal Rounding & Remainder Distribution
- **Decision**: Distribute division remainder cents among participants.
- **Rationale**:
  - When dividing an amount like INR 100.00 among three users, each owes INR 33.3333... If rounded to INR 33.33, the sum of shares is INR 99.99, leaving a remainder of INR 0.01.
  - To maintain absolute referential checks where the sum of shares must equal the total expense amount, SplitBuddy distributes the remainder cent-by-cent to the first few participants.
  - In EXACT and PERCENTAGE splits, rounding cent differences are computed and adjusted on the first participant's share.
- **Tradeoff**: The first participant may pay 1 cent more, but database totals remain consistent and transaction integrity is preserved.

---

## 4. CSV Import: Row-by-Row Transactional Auditing
- **Decision**: Process CSV rows one-by-one inside individual nested database transactions, rather than processing the entire file in one giant transaction.
- **Rationale**:
  - A giant transaction rollbacks everything if even one row contains an anomaly. This is a bad user experience for large files.
  - Row-by-row processing allows saving all valid rows while logging failures to the `import_anomalies` audit table.
  - Settlement transactions in the CSV are automatically intercepted and routed to the `settlements` table.
- **Tradeoff**: Slightly higher write latency due to multiple individual commits, but this provides a highly resilient batch importing experience.
