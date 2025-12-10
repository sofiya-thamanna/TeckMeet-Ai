import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  PhoneOff, 
  Play, 
  Code2, 
  MessageSquare,
  Settings,
  Cpu,
  Monitor,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const ICONS = {
  Video,
  Mic,
  MicOff, 
  VideoOff,
  PhoneOff,
  Play,
  Code2,
  MessageSquare,
  Settings,
  Cpu,
  Monitor,
  FileText,
  ChevronDown,
  ChevronUp
};

export const SUPPORTED_LANGUAGES = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
];

export const LANGUAGE_BOILERPLATES: Record<string, string> = {
  javascript: `// Welcome to the technical interview.
// Solves the Two Sum problem:
// Given an array of integers nums and an integer target, 
// return indices of the two numbers such that they add up to target.

function twoSum(nums, target) {
  // Your code here
  
}

// Example test
console.log(twoSum([2, 7, 11, 15], 9));
`,
  python: `# Welcome to the technical interview.
# Solves the Two Sum problem:
# Given an array of integers nums and an integer target, 
# return indices of the two numbers such that they add up to target.

def two_sum(nums, target):
    # Your code here
    pass

# Example test
print(two_sum([2, 7, 11, 15], 9))
`,
  java: `// Welcome to the technical interview.
// Solves the Two Sum problem:
// Given an array of integers nums and an integer target, 
// return indices of the two numbers such that they add up to target.

import java.util.*;

public class Main {
    public static int[] twoSum(int[] nums, int target) {
        // Your code here
        return new int[]{};
    }

    public static void main(String[] args) {
        int[] result = twoSum(new int[]{2, 7, 11, 15}, 9);
        System.out.println(Arrays.toString(result));
    }
}
`
};

export const INITIAL_CODE = LANGUAGE_BOILERPLATES['javascript'];

export const PCM_SAMPLE_RATE = 16000;
export const AUDIO_OUTPUT_SAMPLE_RATE = 24000;
export const SYSTEM_INSTRUCTION = `You are an experienced Senior Technical Recruiter and Software Engineer at a top tech company. 
You are conducting a live video coding interview with a candidate. 
Your goal is to assess their problem-solving skills, code quality, and communication.
1. Introduce yourself briefly and ask the candidate to introduce themselves.
2. Ask them to solve the coding problem currently on their screen (Two Sum).
3. The candidate can switch languages (JS, Python, Java). Adapt to their choice.
4. Provide hints if they struggle, but don't solve it for them immediately.
5. Keep the conversation flowing naturally. You can see the candidate via their camera.
6. Be encouraging but professional. 
7. If they click 'Run Code', you can ask them about the output.`;