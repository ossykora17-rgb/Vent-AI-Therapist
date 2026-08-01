# Recorded upstream shapes

These are **response shapes**, recorded so the parsing and the wiring can be
tested with no network — not live data, and never served in production. The
routes only read them when `VENT_EXTERNAL_FIXTURE` points here, which nothing
in a deployment sets.

The numbers are deliberately round and obviously illustrative. If you ever see
₦1,605 on a real screen, the fixture leaked and that is a bug.
