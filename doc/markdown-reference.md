# A little Markdown goes a long way

Headings, lists, links, and code. The familiar building blocks of your documentation, rendered with care.

## Everyday formatting

Write **something important**, add _a little emphasis_, or mark ~~an outdated detail~~. Inline code like `npm run kendai` stays easy to spot.

> Good documentation leaves the reader with a clear next step.

## Code blocks

Fenced code blocks support syntax highlighting. Add a language after the opening fence, and use the **Copy** button to take a snippet with you.

```typescript
interface Workspace {
  name: string;
  targets: string[];
}

const workspace: Workspace = {
  name: 'My project',
  targets: ['doc/', 'README.md'],
};

console.log(`Reading ${workspace.name}`);
```

Unknown languages and unlabelled blocks are displayed as plain code.

## Lists and tasks

1. Choose the documents you want to read.
2. Start kendai from your project directory.
3. Follow a link and keep exploring.

Task lists reflect the state written in your Markdown. This is a reader, so checkboxes are read-only.

- [x] Connect a directory
- [x] Open the first document
- [ ] Write the next chapter

## Tables

| Feature                 | Supported | Notes                                      |
| ----------------------- | --------- | ------------------------------------------ |
| Headings and anchors    | Yes       | Repeated headings receive unique IDs.      |
| Code highlighting       | Yes       | Add a language to the code fence.          |
| Relative Markdown links | Yes       | Include the destination in your targets.   |
| Local images            | Yes       | Image paths stay within the allowed roots. |
| Inline HTML             | Limited   | Active content is removed.                 |
| Mermaid, math, MDX      | No        | No special processing in this version.     |

## Local images

Image paths are resolved relative to the document. PNG, JPEG, GIF, WebP, SVG, AVIF, and ICO are supported.

![Three local steps: select, render, read](assets/workflow.svg)

```markdown
![A helpful description](assets/workflow.svg)
```

## A little more detail

<details>
<summary>Can I include HTML in my Markdown?</summary>

Simple formatting, details, summaries, and images are allowed. Scripts, event handlers, embedded frames, forms, and unsafe URLs are removed before content reaches the browser.

</details>

## Keep exploring

Return to the [getting started guide](getting-started.md), or learn about the [architecture](architecture.md).
