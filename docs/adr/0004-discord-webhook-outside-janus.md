# 0004 - The Discord webhook is called directly

Status: accepted

## Context

Umbra notifies the administrator about new requests and missing episodes.
`JANUS.md` says third-party APIs are called through the gateway, and a Discord
webhook is a third-party endpoint.

## Decision

The webhook is called directly, with its URL taken from the environment.

A webhook URL is a self-contained capability: it carries its own secret in the
path, it is not an API key added to a request, and it grants nothing beyond
posting into one channel. Registering it in the gateway would add a record
without adding protection.

## Consequences

- One outbound call that does not go through Janus, documented here so it is not
  mistaken for an oversight.
- Notifications are best effort: a failure is logged and never fails the action
  that triggered it. A recorded request stays recorded even when Discord is
  down.
- The channel sits behind an interface, so e-mail or web push can be added
  without touching any caller. If a future channel needs a real API key, it goes
  through Janus.
