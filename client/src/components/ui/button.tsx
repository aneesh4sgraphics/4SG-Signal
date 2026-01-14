import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,0,0,0.15)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#111111] text-white hover:bg-[#333333] dark:bg-[#FAFAFA] dark:text-[#111111] dark:hover:bg-[#E5E5E5]",
        destructive:
          "bg-[#EF4444] text-white hover:bg-[#DC2626]",
        outline:
          "border border-[#EAEAEA] bg-white hover:bg-[#FAFAFA] text-[#111111] dark:border-[#333333] dark:bg-[#242424] dark:text-[#FAFAFA] dark:hover:bg-[#2A2A2A]",
        secondary:
          "bg-[#F7F7F7] text-[#111111] hover:bg-[#EAEAEA] dark:bg-[#2A2A2A] dark:text-[#FAFAFA] dark:hover:bg-[#333333]",
        ghost: "hover:bg-[#FAFAFA] text-[#111111] dark:text-[#FAFAFA] dark:hover:bg-[#2A2A2A]",
        link: "text-[#111111] underline-offset-4 hover:underline dark:text-[#FAFAFA]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-lg px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
