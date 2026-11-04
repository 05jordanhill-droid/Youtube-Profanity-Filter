// ==UserScript==
// @name         YouTube Profanity Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://www.youtube.com/watch*
// @match        https://www.youtube.com/shorts*
// @grant        none
// @require      https://unpkg.com/@strudel/web@1.3.0
// @sandbox      raw
// @run-at       document-end
// ==/UserScript==

/* global initStrudel, getAudioContext, s, hush, note */


// Chosen Path: Useful
// Chosen Tool: Strudel
// Tools Used: ChatGPT & Google Search's AI



(function() {
    'use strict';


    function getYouTubeCaptions() {
        return new Promise((resolve, reject) => {

            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;

            let completed = false;

            // console.log("Installing transcript interceptor...");

            function cleanup() {
                XMLHttpRequest.prototype.open = originalOpen;
                XMLHttpRequest.prototype.send = originalSend;
            }

            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                this._transcriptRequest =
                    String(url).includes("/api/timedtext");

                if (this._transcriptRequest) {
                    // console.log("TRANSCRIPT REQUEST DETECTED:", url);
                }

                return originalOpen.call(this, method, url, ...args);
            };

            XMLHttpRequest.prototype.send = function(...args) {
                if (this._transcriptRequest) {
                    // console.log("Waiting for transcript response...");

                    this.addEventListener("load", function() {
                        if (completed) return;

                        // console.log("RESPONSE RECEIVED:", this.status);

                        try {
                            const data = JSON.parse(this.responseText);

                            if (!data?.events) {
                                throw new Error("No transcript events found.");
                            }

                            completed = true;
                            cleanup();

                            console.log("CAPTIONS CAPTURED:", data.events.length);

                            resolve(data.events);

                        } catch (error) {
                            completed = true;
                            cleanup();
                            reject(error);
                        }
                    });
                }

                return originalSend.apply(this, args);
            };
        });
    }

    function organizeCaptions(events) {
        return events.flatMap(event => {
            if (!event.segs) return [];

            const segments = event.segs
            .filter(segment =>
                    typeof segment.utf8 === "string" &&
                    segment.utf8 !== "\n"
                   )
            .map(segment => ({
                text: segment.utf8,
                timeMs: event.tStartMs + (segment.tOffsetMs ?? 0)
            }));

            const text = segments.map(segment => segment.text).join("");

            if (!text.trim()) return [];

            return [{
                startMs: event.tStartMs,
                durationMs: event.dDurationMs,
                text,
                segments
            }];
        });
    }

    function stringToRegex(string, extreme=true) {
        if (extreme) {
            const pattern = [...string]
            .map(char => `${RegExp.escape(char)}+`)
            .join("[\\W_]*");

            return new RegExp(`\\b${pattern}\\b`, "i");
        }

        return new RegExp(RegExp.escape(string), "i");
    }

    function containsProfanity(text) {
        // ADJUSTABLE
        const profanity = [
            /\bf+[\W_]*u+[\W_]*c+[\W_]*k+\b/i,
            /\bh+[\W_]*o+[\W_]*l+[\W_]*y+\b/i,
            /\bs+[\W_]*h+[\W_]*i+[\W_]*t+\b/i,
            /\bb+[\W_]*i+[\W_]*t+[\W_]*c+[\W_]*h+\b/i,
            /\ba+[\W_]*s+[\W_]*s+\b/i,
            /\ba+[\W_]*s+[\W_]*s+[\W_]*h+[\W_]*o+[\W_]*l+[\W_]*e+\b/i,
            /\bd+[\W_]*i+[\W_]*c+[\W_]*k+\b/i,
            /\bp+[\W_]*i+[\W_]*s+[\W_]*s+\b/i,
            /\bp+[\W_]*i+[\W_]*s+[\W_]*s+[\W_]*e+[\W_]*d+\b/i,
            /\bc+[\W_]*r+[\W_]*a+[\W_]*p+\b/i,
            /\bb+[\W_]*a+[\W_]*s+[\W_]*t+[\W_]*a+[\W_]*r+[\W_]*d+\b/i,
            /\bs+[\W_]*l+[\W_]*u+[\W_]*t+\b/i,
            /\bw+[\W_]*h+[\W_]*o+[\W_]*r+[\W_]*e+\b/i,
            /\bc+[\W_]*u+[\W_]*n+[\W_]*t+\b/i,
            /\bg+[\W_]*o+[\W_]*d+[\W_]*d+[\W_]*a+[\W_]*m+[\W_]*n+\b/i,
            /\bd+[\W_]*a+[\W_]*m+[\W_]*n+\b/i,
            /\bh+[\W_]*e+[\W_]*l+[\W_]*l+\b/i,
            /\bm+[\W_]*f+\b/i,
            /\bmother[\W_]*f/i,
            /\bb+[\W_]*a+[\W_]*d+[\W_]*[\s_-]*a+[\W_]*s+[\W_]*s+\b/i,
            /\bd+[\W_]*u+[\W_]*m+[\W_]*b+[\W_]*[\s_-]*a+[\W_]*s+[\W_]*s+\b/i,
            /d[\W_]*a[\W_]*m[\W_]*n+/i,
            /\[b+[\W_]*l+[\W_]*e+[\W_]*e+[\W_]*p+[\W_]*!*\]/i,
            /_/,
            "dam",
            /\ba+[\W_]*s+[\W_]*s+[\W_]*e+[\W_]*s+\b/i,
            /\bs+[\W_]*h+[\W_]*i+[\W_]*t+[\W_]*t+[\W_]*y+\b/i,
            /\bget\b/i,
            /\bwhat[\W_]*a\b/i,
            /\bthe[\W_]*a\b/i,
            /\bpiece[\W_]*of\b/i,
            /\bgod\b/i,
            /\bj+[\W_]*e+[\W_]*s+[\W_]*u+[\W_]*s+\b/i,
            "kind of",
            "what a",
            /\bf+[\W_]*u+[\W_]*n+[\W_]*n+[\W_]*i+[\W_]*e+[\W_]*s+[\W_]*t+[\W_]*[\s_-]*e+[\W_]*v+[\W_]*e+[\W_]*r+\b/i,
            /\bfunniest\s+ever\b/i,
            "[___]",
            stringToRegex("donations")
        ];

        const words = text.toLowerCase().match(/\b[\w']+\b/g) ?? [];

        return words.some(word =>
            profanity.some(term =>
                term instanceof RegExp
                ? term.test(word)
                : term === word
            )
        );
    }

    function shouldMute(captions, currentTimeMs) {
        const segments = captions.flatMap(caption => caption.segments);

        const currentIndex = segments.findIndex((segment, index) =>
            segment.timeMs <= currentTimeMs &&
                (index === segments.length - 1 ||
                segments[index + 1].timeMs > currentTimeMs)
        );

        if (currentIndex === -1) return false;

        // ADJUSTABLE
        const lookAhead = 2;

        for (let i = 0; i <= lookAhead; i++) {
            const segment = segments[currentIndex + i];

            if (segment && containsProfanity(segment.text)) {
                return true;
            }
        }

        return false;
    }

    function enableCaptions() {
        // In Tampermonkey, unsafeWindow lets you access the page's actual JS environment
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const player = pageWindow.document.getElementById("movie_player");

        // Verify the player exists and has the API ready
        if (player && typeof player.setOption === 'function') {
            try {
                player.setOption("captions", "track", { languageCode: "en" });
                console.log("Captions successfully forced via Tampermonkey.");

            } catch (e) {
                console.error("Failed to set caption option:", e);
            }
        }
    }
    function disableCaptions() {
        // Access the page's true window object to bypass the Firefox sandbox
        const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const player = pageWindow.document.getElementById("movie_player");

        if (player) {
            try {
                // 1. Force load the module first to ensure the player registers the API handle
                if (typeof player.loadModule === 'function') {
                    player.loadModule("captions");
                }

                // 2. Unload the module to completely turn off and strip captions from the video frame
                if (typeof player.unloadModule === 'function') {
                    player.unloadModule("captions");
                    console.log("Captions successfully turned OFF via Tampermonkey.");
                } else if (typeof player.setOption === 'function') {
                    // Fallback method if unloadModule behaves strictly on certain player versions
                    player.setOption("captions", "track", {});
                }
            } catch (e) {
                console.error("Failed to disable captions:", e);
            }
        }
    }





    let strudel;
    let strudelOutput;
    let strudelGain;
    let strudelAudioContext;

    async function loadStrudel() {
        try {
            strudel = await initStrudel();

            strudelOutput = window.getSuperdoughAudioController().output;
            strudelGain = strudelOutput.destinationGain;
            strudelAudioContext = strudelOutput.audioContext;

            document.addEventListener("click", async function() {
                const ctx = getAudioContext();

                if (ctx.state === "suspended") {
                    await ctx.resume();
                }
            }, { once: true });

        } catch (error) {
            console.error("Initialization error:", error);
        }
    }

    loadStrudel();



    function playMuteSound() {
        strudelGain.gain.setValueAtTime(1, strudelAudioContext.currentTime);

        note("c6")
            .s("sine")
            .gain(0.5)
            .play();

        setTimeout(() => {
            hush();
        }, 150);
    }

    function stopMuteSound() {
        strudelGain.gain.setTargetAtTime(
            0,
            strudelAudioContext.currentTime,
            0.005
        );
    }









    // YouTube uses AJAX to load videos without refreshing.
    // We listen to YouTube's custom navigate event to trigger the captions on every new video.
    document.addEventListener("yt-navigate-finish", () => {
        // Small delay to ensure the player API is fully initialized
        setTimeout(() => {
            enableCaptions();

            setTimeout(() => {
                disableCaptions();
            }, 1000);
        }, 500);
    });

    // Also trigger caption loading for the video already open
    setTimeout(() => {
        enableCaptions();

        setTimeout(() => {
            disableCaptions();
        }, 1000);
    }, 500);

    const captionsPromise = getYouTubeCaptions();

    (async function() {
        try {
            const events = await captionsPromise;
            const captions = organizeCaptions(events)

            // console.log(captions);

            const player = document.getElementById("movie_player");

            let isMuted = false;

            setInterval(() => {
                const currentTimeMs = player.getCurrentTime() * 1000;
                const profanityDetected = shouldMute(captions, currentTimeMs);

                if (profanityDetected && !isMuted) {
                    isMuted = true;

                    player.mute();
                    playMuteSound();

                } else if (!profanityDetected && isMuted) {
                    isMuted = false;

                    player.unMute();
                    stopMuteSound();
                }
            }, 50);

        } catch (error) {
            console.error(error);
        }
    })();
})();