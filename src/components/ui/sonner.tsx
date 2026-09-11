"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { OtterSpinner } from '@/components/brand/OtterSpinner';
import { useTheme } from '@/hooks/useTheme';

/**
 * `theme` has to come from the app's own hook.
 *
 * This read it from `next-themes`, whose provider the app has never mounted, so
 * the hook returned nothing and the default `"system"` took over. Sonner then
 * resolved that against `prefers-color-scheme` rather than against the app, and
 * its own stylesheet carries
 *
 *   [data-sonner-toaster][data-sonner-theme='dark'] [data-description] {
 *     color: hsl(0, 0%, 91%);
 *   }
 *
 * -- so a Mac set to dark, with PaperOtter set to light, printed a near-white
 * description on our light popover. "Sie können es jederzeit erneut versuchen"
 * was invisible.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <OtterSpinner className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
