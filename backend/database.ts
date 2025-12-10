import { Question } from '../types';

export const MOCK_DB_QUESTIONS: Question[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    starterCode: {
      javascript: `// Two Sum\nfunction twoSum(nums, target) {\n  \n}`,
      python: `# Two Sum\ndef two_sum(nums, target):\n    pass`,
      java: `// Two Sum\npublic int[] twoSum(int[] nums, int target) {\n    return new int[]{};\n}`
    }
  },
  {
    id: 'palindrome',
    title: 'Valid Palindrome',
    description: 'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.',
    starterCode: {
      javascript: `// Valid Palindrome\nfunction isPalindrome(s) {\n  \n}`,
      python: `# Valid Palindrome\ndef is_palindrome(s):\n    pass`,
      java: `// Valid Palindrome\npublic boolean isPalindrome(String s) {\n    return false;\n}`
    }
  },
  {
    id: 'reverse-ll',
    title: 'Reverse Linked List',
    description: 'Given the head of a singly linked list, reverse the list, and return the reversed list.',
    starterCode: {
      javascript: `// Reverse Linked List\nfunction reverseList(head) {\n  \n}`,
      python: `# Reverse Linked List\ndef reverse_list(head):\n    pass`,
      java: `// Reverse Linked List\npublic ListNode reverseList(ListNode head) {\n    return null;\n}`
    }
  }
];