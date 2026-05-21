// Public-domain IPIP items. Used as fallback when AI generation fails.
// `reverse: true` means answer is reverse-scored against the trait.

const MINI_IPIP_20 = [
  { id: "mip_1",  trait: "E", reverse: false, text: "I am the life of the party." },
  { id: "mip_2",  trait: "A", reverse: false, text: "I sympathize with others' feelings." },
  { id: "mip_3",  trait: "C", reverse: false, text: "I get chores done right away." },
  { id: "mip_4",  trait: "N", reverse: false, text: "I have frequent mood swings." },
  { id: "mip_5",  trait: "O", reverse: false, text: "I have a vivid imagination." },
  { id: "mip_6",  trait: "E", reverse: true,  text: "I don't talk a lot." },
  { id: "mip_7",  trait: "A", reverse: true,  text: "I am not interested in other people's problems." },
  { id: "mip_8",  trait: "C", reverse: true,  text: "I have difficulty understanding abstract ideas." },
  { id: "mip_9",  trait: "N", reverse: true,  text: "I am relaxed most of the time." },
  { id: "mip_10", trait: "O", reverse: true,  text: "I am not interested in abstract ideas." },
  { id: "mip_11", trait: "E", reverse: false, text: "I talk to a lot of different people at parties." },
  { id: "mip_12", trait: "A", reverse: false, text: "I feel others' emotions." },
  { id: "mip_13", trait: "C", reverse: true,  text: "I often forget to put things back in their proper place." },
  { id: "mip_14", trait: "N", reverse: false, text: "I get upset easily." },
  { id: "mip_15", trait: "O", reverse: false, text: "I have excellent ideas." },
  { id: "mip_16", trait: "E", reverse: true,  text: "I keep in the background." },
  { id: "mip_17", trait: "A", reverse: true,  text: "I am not really interested in others." },
  { id: "mip_18", trait: "C", reverse: true,  text: "I make a mess of things." },
  { id: "mip_19", trait: "N", reverse: true,  text: "I seldom feel blue." },
  { id: "mip_20", trait: "O", reverse: true,  text: "I do not have a good imagination." },
];

const IPIP_50 = [
  // Extraversion (E)
  { id: "ipip_1",  trait: "E", reverse: false, text: "I am the life of the party." },
  { id: "ipip_2",  trait: "E", reverse: true,  text: "I don't talk a lot." },
  { id: "ipip_3",  trait: "E", reverse: false, text: "I feel comfortable around people." },
  { id: "ipip_4",  trait: "E", reverse: true,  text: "I keep in the background." },
  { id: "ipip_5",  trait: "E", reverse: false, text: "I start conversations." },
  { id: "ipip_6",  trait: "E", reverse: true,  text: "I have little to say." },
  { id: "ipip_7",  trait: "E", reverse: false, text: "I talk to a lot of different people at parties." },
  { id: "ipip_8",  trait: "E", reverse: true,  text: "I don't like to draw attention to myself." },
  { id: "ipip_9",  trait: "E", reverse: false, text: "I don't mind being the center of attention." },
  { id: "ipip_10", trait: "E", reverse: true,  text: "I am quiet around strangers." },
  // Agreeableness (A)
  { id: "ipip_11", trait: "A", reverse: true,  text: "I feel little concern for others." },
  { id: "ipip_12", trait: "A", reverse: false, text: "I am interested in people." },
  { id: "ipip_13", trait: "A", reverse: true,  text: "I insult people." },
  { id: "ipip_14", trait: "A", reverse: false, text: "I sympathize with others' feelings." },
  { id: "ipip_15", trait: "A", reverse: true,  text: "I am not interested in other people's problems." },
  { id: "ipip_16", trait: "A", reverse: false, text: "I have a soft heart." },
  { id: "ipip_17", trait: "A", reverse: true,  text: "I am not really interested in others." },
  { id: "ipip_18", trait: "A", reverse: false, text: "I take time out for others." },
  { id: "ipip_19", trait: "A", reverse: false, text: "I feel others' emotions." },
  { id: "ipip_20", trait: "A", reverse: false, text: "I make people feel at ease." },
  // Conscientiousness (C)
  { id: "ipip_21", trait: "C", reverse: false, text: "I am always prepared." },
  { id: "ipip_22", trait: "C", reverse: true,  text: "I leave my belongings around." },
  { id: "ipip_23", trait: "C", reverse: false, text: "I pay attention to details." },
  { id: "ipip_24", trait: "C", reverse: true,  text: "I make a mess of things." },
  { id: "ipip_25", trait: "C", reverse: false, text: "I get chores done right away." },
  { id: "ipip_26", trait: "C", reverse: true,  text: "I often forget to put things back in their proper place." },
  { id: "ipip_27", trait: "C", reverse: false, text: "I like order." },
  { id: "ipip_28", trait: "C", reverse: true,  text: "I shirk my duties." },
  { id: "ipip_29", trait: "C", reverse: false, text: "I follow a schedule." },
  { id: "ipip_30", trait: "C", reverse: false, text: "I am exacting in my work." },
  // Neuroticism (N)
  { id: "ipip_31", trait: "N", reverse: false, text: "I get stressed out easily." },
  { id: "ipip_32", trait: "N", reverse: true,  text: "I am relaxed most of the time." },
  { id: "ipip_33", trait: "N", reverse: false, text: "I worry about things." },
  { id: "ipip_34", trait: "N", reverse: true,  text: "I seldom feel blue." },
  { id: "ipip_35", trait: "N", reverse: false, text: "I am easily disturbed." },
  { id: "ipip_36", trait: "N", reverse: false, text: "I get upset easily." },
  { id: "ipip_37", trait: "N", reverse: false, text: "I change my mood a lot." },
  { id: "ipip_38", trait: "N", reverse: false, text: "I have frequent mood swings." },
  { id: "ipip_39", trait: "N", reverse: false, text: "I get irritated easily." },
  { id: "ipip_40", trait: "N", reverse: false, text: "I often feel blue." },
  // Openness (O)
  { id: "ipip_41", trait: "O", reverse: false, text: "I have a rich vocabulary." },
  { id: "ipip_42", trait: "O", reverse: true,  text: "I have difficulty understanding abstract ideas." },
  { id: "ipip_43", trait: "O", reverse: false, text: "I have a vivid imagination." },
  { id: "ipip_44", trait: "O", reverse: true,  text: "I am not interested in abstract ideas." },
  { id: "ipip_45", trait: "O", reverse: false, text: "I have excellent ideas." },
  { id: "ipip_46", trait: "O", reverse: true,  text: "I do not have a good imagination." },
  { id: "ipip_47", trait: "O", reverse: false, text: "I am quick to understand things." },
  { id: "ipip_48", trait: "O", reverse: false, text: "I use difficult words." },
  { id: "ipip_49", trait: "O", reverse: false, text: "I spend time reflecting on things." },
  { id: "ipip_50", trait: "O", reverse: false, text: "I am full of ideas." },
];

function getFallbackItems(depth) {
  return depth === "deep" ? IPIP_50 : MINI_IPIP_20;
}

module.exports = { MINI_IPIP_20, IPIP_50, getFallbackItems };
