import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const LINE1 = "If we build, we build to lead.";
const LINE2 = "CYNERA SYSTEMS OS";

const wordVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
  exit: {},
};

function WordReveal({ text, style }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ display: "flex", gap: "0.32em", flexWrap: "wrap", justifyContent: "center", ...style }}
    >
      {text.split(" ").map((word, i) => (
        <motion.span key={i} variants={wordVariants}>
          {word}
        </motion.span>
      ))}
    </motion.div>
  );
}

export function IntroScreen({ onComplete }) {
  const [phase, setPhase] = useState("waiting");

  useEffect(() => {
    function start() {
      setPhase("line1");
      const t1 = setTimeout(() => setPhase("line2"), 2800);
      const t2 = setTimeout(() => {
        setPhase("done");
        onComplete();
      }, 4600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    if (document.readyState === "complete") {
      const t = setTimeout(start, 200);
      return () => clearTimeout(t);
    } else {
      const handler = () => setTimeout(start, 200);
      window.addEventListener("load", handler, { once: true });
      return () => window.removeEventListener("load", handler);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      style={{
        position: "fixed", inset: 0, background: "#000",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <AnimatePresence mode="wait">
        {phase === "line1" && (
          <WordReveal
            key="line1"
            text={LINE1}
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              fontWeight: 300,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          />
        )}
        {phase === "line2" && (
          <WordReveal
            key="line2"
            text={LINE2}
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
