import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUpload } from '@/hooks/use-upload';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Palette,
  Undo,
  Redo,
  Type,
  AlignVerticalSpaceAround,
  Code,
  ZoomIn,
  ZoomOut,
  Upload,
  Loader2,
} from 'lucide-react';

// Custom extension for line height
const LineHeight = Extension.create({
  name: 'lineHeight',
  
  addOptions() {
    return {
      types: ['paragraph'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => element.style.lineHeight || null,
            renderHTML: attributes => {
              if (!attributes.lineHeight) {
                return {};
              }
              return {
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ commands }: any) => {
        return this.options.types.every((type: string) => 
          commands.updateAttributes(type, { lineHeight })
        );
      },
      unsetLineHeight: () => ({ commands }: any) => {
        return this.options.types.every((type: string) => 
          commands.updateAttributes(type, { lineHeight: null })
        );
      },
    };
  },
});

// Custom extension for font family
const FontFamily = Extension.create({
  name: 'fontFamily',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: element => element.style.fontFamily?.replace(/['"]/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontFamily) {
                return {};
              }
              return {
                style: `font-family: ${attributes.fontFamily}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontFamily: (fontFamily: string) => ({ chain }: any) => {
        return chain().setMark('textStyle', { fontFamily }).run();
      },
      unsetFontFamily: () => ({ chain }: any) => {
        return chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run();
      },
    };
  },
});

const FONT_FAMILIES = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
];

const LINE_HEIGHT_OPTIONS = [
  { value: '1', label: 'Single' },
  { value: '1.5', label: '1.5' },
  { value: '2', label: 'Double' },
  { value: '2.5', label: '2.5' },
];

interface EmailRichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onInsertVariable?: (variable: string) => void;
  placeholder?: string;
  className?: string;
}

export interface EmailRichTextEditorRef {
  insertContent: (content: string) => void;
  focus: () => void;
}

const PRESET_COLORS = [
  '#000000', '#374151', '#6b7280', '#9ca3af',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

export const EmailRichTextEditor = forwardRef<EmailRichTextEditorRef, EmailRichTextEditorProps>(({
  content,
  onChange,
  placeholder = 'Start typing your email...',
  className = '',
}, ref) => {
  const imageUrlRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState(content);
  const [selectedImageSize, setSelectedImageSize] = useState<number>(100);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      console.log('[Image Upload] Success:', response.objectPath);
    },
    onError: (error) => {
      console.error('[Image Upload] Error:', error);
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
      }),
      Underline,
      TextStyle,
      Color,
      LineHeight,
      FontFamily,
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!isHtmlMode) {
      setHtmlSource(content);
    }
  }, [content, isHtmlMode]);

  const toggleHtmlMode = useCallback(() => {
    if (isHtmlMode) {
      if (editor) {
        editor.commands.setContent(htmlSource);
        onChange(htmlSource);
      }
    } else {
      if (editor) {
        setHtmlSource(editor.getHTML());
      }
    }
    setIsHtmlMode(!isHtmlMode);
  }, [isHtmlMode, htmlSource, editor, onChange]);

  const handleHtmlChange = useCallback((value: string) => {
    setHtmlSource(value);
    onChange(value);
  }, [onChange]);

  const [isImageSelected, setIsImageSelected] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const updateImageState = () => {
      const active = editor.isActive('image');
      setIsImageSelected(active);
      
      if (active) {
        const attrs = editor.getAttributes('image');
        if (attrs.width) {
          const widthStr = typeof attrs.width === 'string' ? attrs.width : `${attrs.width}`;
          const parsed = parseInt(widthStr.replace('%', ''));
          if (!isNaN(parsed)) {
            setSelectedImageSize(parsed);
          }
        } else {
          setSelectedImageSize(100);
        }
      }
    };

    updateImageState();

    editor.on('selectionUpdate', updateImageState);
    editor.on('transaction', updateImageState);

    return () => {
      editor.off('selectionUpdate', updateImageState);
      editor.off('transaction', updateImageState);
    };
  }, [editor]);

  const resizeSelectedImage = useCallback((scale: number) => {
    if (editor && editor.isActive('image')) {
      const attrs = editor.getAttributes('image');
      const currentWidth = attrs.width || '100%';
      const numericWidth = typeof currentWidth === 'string' 
        ? parseInt(currentWidth.replace('%', '')) 
        : currentWidth;
      const newWidth = Math.max(25, Math.min(100, numericWidth + scale));
      
      editor.chain().focus().updateAttributes('image', { 
        width: `${newWidth}%`,
        style: `width: ${newWidth}%; max-width: ${newWidth}%;`
      }).run();
      setSelectedImageSize(newWidth);
    }
  }, [editor]);

  const setImageSize = useCallback((size: number) => {
    if (editor && editor.isActive('image')) {
      editor.chain().focus().updateAttributes('image', { 
        width: `${size}%`,
        style: `width: ${size}%; max-width: ${size}%;`
      }).run();
      setSelectedImageSize(size);
    }
  }, [editor]);

  useImperativeHandle(ref, () => ({
    insertContent: (text: string) => {
      if (editor) {
        editor.chain().focus().insertContent(text).run();
      }
    },
    focus: () => {
      if (editor) {
        editor.chain().focus().run();
      }
    },
  }), [editor]);

  const insertImage = useCallback(() => {
    const url = imageUrlRef.current?.value;
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
      if (imageUrlRef.current) imageUrlRef.current.value = '';
    }
  }, [editor]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    
    if (!file.type.startsWith('image/')) {
      console.error('[Image Upload] Invalid file type:', file.type);
      return;
    }
    
    const response = await uploadFile(file);
    if (response?.objectPath) {
      const imageUrl = `${window.location.origin}${response.objectPath}`;
      editor.chain().focus().setImage({ src: imageUrl }).run();
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [editor, uploadFile]);

  const insertLink = useCallback(() => {
    const url = linkUrlRef.current?.value;
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
      if (linkUrlRef.current) linkUrlRef.current.value = '';
    }
  }, [editor]);

  const removeLink = useCallback(() => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[200px] border rounded-lg bg-gray-50 animate-pulse" />;
  }

  return (
    <div className={`border rounded-lg overflow-hidden bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('strike') ? 'bg-gray-200' : ''}`}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-gray-200' : ''}`}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-gray-200' : ''}`}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`h-8 w-8 p-0 ${editor.isActive({ textAlign: 'left' }) ? 'bg-gray-200' : ''}`}
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`h-8 w-8 p-0 ${editor.isActive({ textAlign: 'center' }) ? 'bg-gray-200' : ''}`}
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`h-8 w-8 p-0 ${editor.isActive({ textAlign: 'right' }) ? 'bg-gray-200' : ''}`}
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Font Family Selector */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1"
              title="Font Family"
            >
              <Type className="h-3 w-3" />
              <span className="max-w-16 truncate">Font</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="space-y-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-7"
                onClick={() => (editor.commands as any).unsetFontFamily()}
              >
                Default
              </Button>
              {FONT_FAMILIES.map((font) => (
                <Button
                  key={font.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  style={{ fontFamily: font.value }}
                  onClick={() => (editor.commands as any).setFontFamily(font.value)}
                >
                  {font.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Line Spacing Selector */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1"
              title="Line Spacing"
            >
              <AlignVerticalSpaceAround className="h-3 w-3" />
              <span>Line</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-2">
            <div className="space-y-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-7"
                onClick={() => (editor.commands as any).unsetLineHeight()}
              >
                Default
              </Button>
              {LINE_HEIGHT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => (editor.commands as any).setLineHeight(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Text Color"
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-4 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-gray-200' : ''}`}
              title="Insert Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="space-y-2">
              <Label className="text-xs">Link URL</Label>
              <Input
                ref={linkUrlRef}
                type="url"
                placeholder="https://example.com"
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={insertLink}>
                  Insert Link
                </Button>
                {editor.isActive('link') && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={removeLink}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Insert Image"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Upload Image</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="image-upload-input"
                  />
                  <Button 
                    size="sm" 
                    className="h-8 text-xs flex-1 gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" />
                        Choose File
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Upload images from your computer (JPG, PNG, GIF)</p>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-popover px-2 text-muted-foreground">or</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Paste Image URL</Label>
                <Input
                  ref={imageUrlRef}
                  type="url"
                  placeholder="https://example.com/image.png"
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={insertImage}>
                  Insert from URL
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 w-8 p-0"
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 w-8 p-0"
          title="Redo"
        >
          <Redo className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Image Resize Controls */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={isImageSelected ? "secondary" : "ghost"}
              size="sm"
              className={`h-8 px-2 text-xs gap-1 ${isImageSelected ? 'bg-green-100 text-green-700' : ''}`}
              title="Resize Image"
            >
              <ZoomIn className="h-3 w-3" />
              <span>Size</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3">
            <div className="space-y-3">
              <Label className="text-xs font-medium">Image Size</Label>
              {isImageSelected ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => resizeSelectedImage(-10)}
                      title="Decrease size"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium flex-1 text-center">{selectedImageSize}%</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => resizeSelectedImage(10)}
                      title="Increase size"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[25, 50, 75, 100].map((size) => (
                      <Button
                        key={size}
                        type="button"
                        size="sm"
                        variant={selectedImageSize === size ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setImageSize(size)}
                      >
                        {size}%
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">Click on an image in the editor to resize it</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* HTML Source Mode Toggle */}
        <Button
          type="button"
          variant={isHtmlMode ? "secondary" : "ghost"}
          size="sm"
          onClick={toggleHtmlMode}
          className={`h-8 px-2 text-xs gap-1 ${isHtmlMode ? 'bg-blue-100 text-blue-700' : ''}`}
          title={isHtmlMode ? "Switch to Visual Editor" : "Edit HTML Source"}
        >
          <Code className="h-3 w-3" />
          <span>{isHtmlMode ? "Visual" : "HTML"}</span>
        </Button>
      </div>

      {isHtmlMode ? (
        <Textarea
          value={htmlSource}
          onChange={(e) => handleHtmlChange(e.target.value)}
          className="min-h-[200px] font-mono text-sm border-0 rounded-none focus-visible:ring-0"
          placeholder="Enter HTML code here..."
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
});

export function insertVariableAtCursor(editor: any, variable: string) {
  if (editor) {
    editor.chain().focus().insertContent(`{{${variable}}}`).run();
  }
}
