# 0001 - One Next.js application rather than a split front and back

Status: accepted

## Context

The original brief asked for a React front end and a separate Spring Boot API.
Umbra is a personal project with one maintainer, a handful of screens, and a
deployment target where every extra container costs disk on a machine that is
already close to full.

## Decision

One Next.js application holds the interface, the API routes and the scheduled
work. Server components read from the domain layer directly; writes go through
REST routes so validation, rate limiting and authorisation live in one place.

## Consequences

- One image, one deployment unit, one language, one type system end to end.
- No network hop between the interface and the data, so a page renders in one
  round trip instead of several.
- Scheduling is not part of the framework: a worker container calls an
  idempotent endpoint on a loop, which is a small price for keeping the
  application self-contained.
- If a second consumer ever appears, the REST routes already exist.
