/**
 * The class every tool's primary action button wears.
 *
 * There were three sizes in use: eight buttons filled their action bar with
 * `flex-1`, eight sat at content width behind a `flex-1` spacer, and Generate
 * Preview had a `min-w-[clamp(12rem,26vw,20rem)]` of its own. Same job, same
 * position on screen, three different widths depending on which tool you had
 * opened.
 *
 * `flex-1` wins because it is what Apply Redactions already did and what most
 * of the others already did: the button takes the bar, less whatever Back and a
 * cancel link need. That makes the primary action the widest target on the
 * screen in every tool, which is what it should be.
 *
 * Buttons that sit in a vertical stack rather than an action bar use `w-full`,
 * which is the same intent where there is no row to divide.
 */
export const PRIMARY_ACTION = 'flex-1 justify-center';
