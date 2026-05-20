# Section Definitions

This file defines the rule categories for Postgres best practices. Rules are automatically assigned to sections based on their filename prefix.

Take the examples below as pure demonstrative. Replace each section with the actual rule categories for Postgres best practices.

---

## 1. Query Performance (query)
**Impact:** CRITICAL
**Description:** Slow queries, missing indexes, inefficient query plans. The most common source of Postgres performance issues.

## 2. Connection Management (conn)
**Impact:** CRITICAL
**Description:** Connection pooling, limits, and serverless strategies. Critical for applications with high concurrency or serverless deployments.

## 3. Security & RLS (security)
**Impact:** CRITICAL
**Description:** Row-Level Security policies, privilege management, and authentication patterns.

## 4. Schema Design (schema)
**Impact:** HIGH
**Description:** Table design, index strategies, partitioning, and data type selection. Foundation for long-term performance.


