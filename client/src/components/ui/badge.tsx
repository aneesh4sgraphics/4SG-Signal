import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[#EAEAEA] bg-[#F2F2F2] text-[#111111] dark:border-[#333333] dark:bg-[#2A2A2A] dark:text-[#FAFAFA]",
        secondary:
          "border-[#EAEAEA] bg-[#FAFAFA] text-[#666666] dark:border-[#333333] dark:bg-[#2A2A2A] dark:text-[#999999]",
        destructive:
          "border-transparent bg-[#FEE2E2] text-[#DC2626] dark:bg-[#7F1D1D] dark:text-[#FECACA]",
        success:
          "border-transparent bg-[#DCFCE7] text-[#15803D] dark:bg-[#14532D] dark:text-[#BBF7D0]",
        warning:
          "border-transparent bg-[#FEF3C7] text-[#B45309] dark:bg-[#78350F] dark:text-[#FDE68A]",
        outline: "border-[#EAEAEA] text-[#111111] dark:border-[#333333] dark:text-[#FAFAFA]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
