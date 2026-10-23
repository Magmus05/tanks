import { useEffect, useRef } from "react";
import Phaser from "phaser";

import { MainScene } from "./scenes/MainScene";
import { StartScene } from "./scenes/StartScene";

if (import.meta.hot) {
  import.meta.hot.accept("./scenes/MainScene", () => {
    window.location.reload();
  });
}

interface PhaserGameProps {
  onReady?: () => void;
}

export const PhaserGame = ({ onReady }: PhaserGameProps) => {
  const gameContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!gameContainerRef.current) {
      return;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 800,

      parent: gameContainerRef.current,

      backgroundColor: "#202020",

      physics: {
        default: "arcade",
        arcade: {
          debug: true,
        },
      },

      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },

      scene: [StartScene, MainScene],
    });
    // console.log(game);

    game.events.once(Phaser.Core.Events.READY, () => {
      onReady?.();
    });

    return () => {
      game.destroy(true);
    };
  }, [onReady]);

  return (
    <div className="game-container">
      <div ref={gameContainerRef} />
    </div>
  );
};
