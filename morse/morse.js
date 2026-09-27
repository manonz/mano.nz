class MorseCode {

    // One Morse timing unit.
    static UNIT = 100;

    // International Morse alphabet.
    static map = {

        A: ".-",     B: "-...",   C: "-.-.",   D: "-..",
        E: ".",      F: "..-.",  G: "--.",    H: "....",
        I: "..",     J: ".---",  K: "-.-",    L: ".-..",
        M: "--",     N: "-.",    O: "---",    P: ".--.",
        Q: "--.-",   R: ".-.",   S: "...",   T: "-",
        U: "..-",    V: "...-",  W: ".--",   X: "-..-",
        Y: "-.--",   Z: "--..",

        0: "-----",  1: ".----", 2: "..---", 3: "...--",
        4: "....-",  5: ".....", 6: "-....", 7: "--...",
        8: "---..",  9: "----."
    };

    // Convert ordinary text into printable Morse.

    static encode(text) {
        return text.toUpperCase().trim().split(/\s+/).map(word =>
                [...word]
                    .map(character =>
                        MorseCode.map[character] ?? ""
                    )
                    .filter(Boolean)
                    .join(" ")
            )
            .filter(Boolean)
            .join(" / ");
    }

    // Create the complete Morse timing sequence.
    static timeline(text) {
        const words = text.toUpperCase().trim().split(/\s+/).filter(Boolean);
        const items = [];

        let characterIndex = 0;
        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
            const word = words[wordIndex];
            for (let characterPosition = 0; characterPosition < word.length; characterPosition++) {
                const character = word[characterPosition];
                const code = MorseCode.map[character];

                if (!code) {
                    continue;
                }

                /*
                 * Dot or dash.
                 */
                for (let i = 0; i < code.length; i++) {
                    const symbol = code[i];
                    items.push({ tone: true, symbol: symbol,
                        characterIndex: characterIndex,
                        duration:
                            symbol === "."
                                ? MorseCode.UNIT
                                : 3 * MorseCode.UNIT
                    });


                    /*
                     * Gap between elements
                     * of the same character.
                     */

                    if (i < code.length - 1) {
                        items.push({tone: false, symbol: "element-gap", characterIndex: characterIndex, duration: MorseCode.UNIT
                        });
                    }
                }


                /*
                 * Gap between characters.
                 */

                if (characterPosition < word.length - 1) {
                    items.push({ tone: false, symbol: "letter-gap",
                        characterIndex: characterIndex, duration: 3 * MorseCode.UNIT
                    });
                }

                characterIndex++;
            }


            /*
             * Gap between words.
             *
             * It does not belong to a character.
             */

            if (wordIndex < words.length - 1) {
                items.push({
                    tone: false,
                    symbol: "word-gap",
                    characterIndex: null,
                    duration: 7 * MorseCode.UNIT
                });
            }
        }

        /*
         * Seven units of silence at the end.
         */

        if (items.length) {

            items.push({
                tone: false,
                symbol: "end-gap",
                characterIndex: null,
                duration: 7 * MorseCode.UNIT
            });
        }

        /*
         * Calculate absolute times.
         */

        let time = 0;

        for (const item of items) {
            item.start = time;
            item.end = time + item.duration;

            time = item.end;
        }

       return { items: items, duration: time };
    }
}
