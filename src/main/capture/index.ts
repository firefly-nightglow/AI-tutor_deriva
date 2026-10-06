/**
 * Screen capture module boundary reserved by ADR-0004.
 *
 * v1 (SPEC-0001) does not read the screen. v2 adds screenshot capture and selection-to-ask here,
 * so the capability grows inside a known module instead of spreading through the main process.
 */
export {}
