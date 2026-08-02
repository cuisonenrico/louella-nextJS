// bcrypt work factor for password hashing. 12 is the current baseline
// recommendation (roughly 4x the work of the old default of 10); bump here
// if hardware moves on, and re-hash opportunistically on next login.
export const BCRYPT_COST_FACTOR = 12;
