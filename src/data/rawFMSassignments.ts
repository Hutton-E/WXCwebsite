export interface RawFmsAssignment {
  rawName: string;
  category: string;
  variant: "All" | "6";
}

export const RAW_FMS_ASSIGNMENTS: RawFmsAssignment[] = [
  { rawName: "Philip Dahlen", category: "Trunk Stability", variant: "All" },
  { rawName: "Leah McDonald", category: "Trunk Stability", variant: "All" },
  { rawName: "Grace Vortherms", category: "Trunk Stability", variant: "All" },
  { rawName: "Julia Burney", category: "Trunk Stability", variant: "All" },
  { rawName: "Peyton Morey", category: "Trunk Stability", variant: "All" },
  { rawName: "Maya Zopel", category: "Trunk Stability", variant: "All" },
  { rawName: "Alyssa Higgins", category: "Trunk Stability", variant: "All" },
  { rawName: "Makenna Hetrick", category: "Trunk Stability", variant: "All" },
  { rawName: "Zoe Cordes", category: "Trunk Stability", variant: "All" },
  { rawName: "Stella Rose", category: "Trunk Stability", variant: "All" },
  { rawName: "Jillian Borgelt", category: "Trunk Stability", variant: "All" },
  { rawName: "Zaya Peirce", category: "Trunk Stability", variant: "All" },
  { rawName: "Ava Vanderheyden", category: "Trunk Stability", variant: "All" },
  { rawName: "Dax Duffy", category: "Trunk Stability", variant: "All" },

  { rawName: "Lily Cooper", category: "Trunk Stability", variant: "6" },
  { rawName: "Ava Vance", category: "Trunk Stability", variant: "6" },
  { rawName: "Mason Coulter", category: "Trunk Stability", variant: "6" },
  { rawName: "Janae Hansen", category: "Trunk Stability", variant: "6" },
  { rawName: "Lydia Maas", category: "Trunk Stability", variant: "6" },

  {
    rawName: "Addie Thompson",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Adam Wilke",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Kasey Levinsohn",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Abbey Angus",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Jackson Cicchinelli",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Henry Nichols",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Toben Edney",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Austin Soldwisch",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Reagan Cogdill",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "James Maso",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Caleb Olson",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Ben Neville",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Myles Matthias",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },

  {
    rawName: "Lillyan Kiehne",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Solomon Zaugg",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Jonathan Meyer",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Claire Hoyer",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Alex Horstman",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Cooper Cook",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "AJ Schermerhorn",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Wes Hulseberg",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Sawyer Schmidt",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },

  { rawName: "Jade Anderson", category: "Rotary Stability", variant: "All" },
  { rawName: "Silas Gann", category: "Rotary Stability", variant: "All" },
  { rawName: "Jack Behrens", category: "Rotary Stability", variant: "All" },

  { rawName: "Riley Kuhn", category: "Rotary Stability", variant: "6" },
  { rawName: "Connor Martin", category: "Rotary Stability", variant: "6" },
  { rawName: "Hutton Edney", category: "Rotary Stability", variant: "6" },

  {
    rawName: "Joel Ramirez-Parra",
    category: "Shoulder Mobility",
    variant: "All",
  },
  { rawName: "Rylan Martin", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Dawson Fricke", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Carter Mulford", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Camden Kilker", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Evan Cook", category: "Shoulder Mobility", variant: "All" },

  { rawName: "Gage Heyne", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Drew Moser", category: "Shoulder Mobility", variant: "6" },
  { rawName: "AJ Angus", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Ava Vance", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Aaron Lursen", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Morgan Engel", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Anna Quillin", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Jakob Regennitter", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Caden Kueker", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Cali Trygstad", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Ryan Heden", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Hannah Ramsey", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Isaiah Hammerand", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Cooper Bankston", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Derek Coulter", category: "Shoulder Mobility", variant: "6" },

  { rawName: "Bryn Wright", category: "Hurdle Step", variant: "6" },
  { rawName: "Alex Pries", category: "Hurdle Step", variant: "6" },

  { rawName: "Nathan Kinzer", category: "Incline Lunge", variant: "6" },
];
