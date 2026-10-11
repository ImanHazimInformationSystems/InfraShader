// Editable shadcn/ui-style Radix button, adapted to InfraShader's existing tokens.
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800', {
  variants: { variant: { default: 'bg-emerald-950 text-white hover:bg-emerald-800', outline: 'border border-stone-300 bg-white text-emerald-950 hover:bg-stone-100', destructive: 'bg-red-800 text-white hover:bg-red-700' } },
  defaultVariants: { variant: 'default' },
})
export function Button({ className, variant, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(variants({ variant, className }))} {...props} />
}
