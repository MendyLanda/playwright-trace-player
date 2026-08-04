import type { SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  label?: string
}

function Icon({ children, label, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      fill="none"
      viewBox="0 0 24 24"
      {...props}
    >
      {children}
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8.25 5.4 10 6.6-10 6.6V5.4Z" fill="currentColor" />
    </Icon>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 5.5h3v13h-3zm6 0h3v13h-3z" fill="currentColor" />
    </Icon>
  )
}

export function ExpandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 4.5h-4v4m11-4h4v4m-15 7v4h4m11-4v4h-4" stroke="currentColor" strokeWidth="1.8" />
    </Icon>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" />
    </Icon>
  )
}

export function CursorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M5.2 3.7v14.8l3.9-3.8 2.7 5 2.4-1.3-2.7-4.9h5.4L5.2 3.7Z"
        fill="currentColor"
        stroke="#10110e"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </Icon>
  )
}

export function RetryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 8a8 8 0 1 0 .2 7.6M19 4v4h-4" stroke="currentColor" strokeWidth="1.8" />
    </Icon>
  )
}

export function TraceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="5" width="15" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 14 2.4-3 2.2 2.2 3.4-4.1" stroke="currentColor" strokeWidth="1.6" />
    </Icon>
  )
}
