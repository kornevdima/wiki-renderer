"use client"

import * as React from "react"

import { RICH_TEXT_MESSAGES, type RichTextMessages } from "@/components/ui/rich-text-messages"

/**
 * What the RichTextEditor's own controls (toolbar, image and link dialogs) need from the editor's props. They render inside
 * MDXEditor's tree, which passes React context through, so the editor provides this once around it.
 */
export interface RichTextOptions {
  messages: RichTextMessages
  /** Uploads a picked image and answers the address to insert. Without it the image dialog takes an address only. */
  onUploadImage?: (file: File) => Promise<string>
  /** The native `accept` list for the image picker. */
  imageAccept: string
  /** The largest image the picker accepts, in bytes. */
  imageMaxSize: number
  /** The app's own toolbar items, after the built-in groups. */
  toolbarExtra?: React.ReactNode
}

export const RICH_TEXT_IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
export const RICH_TEXT_IMAGE_MAX_SIZE = 10 * 1024 * 1024

export const RichTextContext = React.createContext<RichTextOptions>({
  messages: RICH_TEXT_MESSAGES,
  imageAccept: RICH_TEXT_IMAGE_ACCEPT,
  imageMaxSize: RICH_TEXT_IMAGE_MAX_SIZE,
})

export function useRichText(): RichTextOptions {
  return React.useContext(RichTextContext)
}
