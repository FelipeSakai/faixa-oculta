import React from "react";

import { motion, useReducedMotion } from 'motion/react';

// A two-line adaptation of the soft-focus reveal from React Bits' Blur Text.
export function BlurReveal({ lines, as: Heading = 'h1', className, ...props }) {
  const reduceMotion = useReducedMotion();

  return (
    <Heading className={className} aria-label={lines.join(' ')} {...props}>
      {lines.map((line, index) => (
        <motion.span
          aria-hidden="true"
          key={line}
          className="blur-line"
          initial={reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={reduceMotion
            ? { duration: 0 }
            : { duration: 0.58, delay: index * 0.105, ease: [0.22, 1, 0.36, 1] }}
        >
          {line}
        </motion.span>
      ))}
    </Heading>
  );
}
