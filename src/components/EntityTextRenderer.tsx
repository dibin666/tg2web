import React from "react";
import { TelegramEntity } from "../api/types";

interface EntityTextRendererProps {
  text?: string;
  entities?: TelegramEntity[];
}

export const EntityTextRenderer: React.FC<EntityTextRendererProps> = ({ text, entities }) => {
  if (!text) return null;
  if (!entities || entities.length === 0) {
    return <>{text}</>;
  }

  // 1. Collect all valid boundary points
  const boundarySet = new Set<number>([0, text.length]);

  entities.forEach((ent) => {
    const start = ent.offsetUtf16;
    const end = ent.offsetUtf16 + ent.lengthUtf16;
    if (start >= 0 && start < text.length) {
      boundarySet.add(start);
    }
    if (end > 0 && end <= text.length) {
      boundarySet.add(end);
    }
  });

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  // 2. Build React nodes for each interval
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const subStr = text.substring(start, end);

    // Find all entities that cover this interval
    const activeEntities = entities.filter(
      (ent) => ent.offsetUtf16 <= start && end <= ent.offsetUtf16 + ent.lengthUtf16
    );

    // Sort active entities by length (ascending) so the narrowest/innermost wraps first
    activeEntities.sort((a, b) => a.lengthUtf16 - b.lengthUtf16);

    let element: React.ReactNode = subStr;

    activeEntities.forEach((ent, entIdx) => {
      element = wrapEntity(element, ent, `${i}-${entIdx}`);
    });

    parts.push(<React.Fragment key={i}>{element}</React.Fragment>);
  }

  return <>{parts}</>;
};

// Wraps a React node based on TelegramEntity type
function wrapEntity(node: React.ReactNode, entity: TelegramEntity, key: string): React.ReactNode {
  switch (entity.type) {
    case "bold":
      return <strong key={key}>{node}</strong>;
    case "italic":
      return <em key={key}>{node}</em>;
    case "underline":
      return (
        <span key={key} className="underline underline-offset-2">
          {node}
        </span>
      );
    case "strikethrough":
      return (
        <span key={key} className="line-through">
          {node}
        </span>
      );
    case "code":
      return <code key={key} className="telegram-code">{node}</code>;
    case "pre":
      return (
        <pre key={key} className="telegram-pre">
          {entity.language ? <span className="pre-lang">{entity.language}</span> : null}
          <code>{node}</code>
        </pre>
      );
    case "text_link":
      return (
        <a
          key={key}
          href={entity.url}
          target="_blank"
          rel="noopener noreferrer"
          className="telegram-link"
          onClick={(e) => e.stopPropagation()}
        >
          {node}
        </a>
      );
    case "mention":
      return (
        <span key={key} className="telegram-mention">
          {node}
        </span>
      );
    case "spoiler":
      return (
        <span
          key={key}
          className="telegram-spoiler"
          onClick={(e) => {
            e.stopPropagation();
            e.currentTarget.classList.toggle("revealed");
          }}
        >
          {node}
        </span>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="telegram-blockquote">
          {node}
        </blockquote>
      );
    case "custom_emoji":
      return (
        <span key={key} className="telegram-custom-emoji" title={`Custom Emoji: ${entity.customEmojiId}`}>
          {node}
          <span className="emoji-badge">✨</span>
        </span>
      );
    default:
      return node;
  }
}
