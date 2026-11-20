const assert = require('assert');

// Test the exact calculation logic implemented in ProductScreen
function calculatePiecesFromWeight(targetGrams, pieceWeight, isReady = false, stockLeft = Infinity) {
  if (!(targetGrams > 0) || !(pieceWeight > 0)) return 1;
  const calcPieces = Math.max(1, Math.round(targetGrams / pieceWeight));
  const cap = isReady ? Math.max(1, stockLeft) : Infinity;
  return Math.min(cap, calcPieces);
}

function calculateWeightFromPieces(pieces, pieceWeight) {
  if (!(pieces > 0) || !(pieceWeight > 0)) return 0;
  return parseFloat((pieces * pieceWeight).toFixed(2));
}

console.log('--- Testing Weight to Pieces Auto-Calculation ---');

// Test Case 1: User enters 200g for piece weight 1.25g
{
  const targetGrams = 200;
  const pieceWeight = 1.25;
  const pieces = calculatePiecesFromWeight(targetGrams, pieceWeight);
  assert.strictEqual(pieces, 160, '200g at 1.25g/pc should equal 160 pcs');
  const resultingWeight = calculateWeightFromPieces(pieces, pieceWeight);
  assert.strictEqual(resultingWeight, 200, '160 pcs at 1.25g/pc should equal 200g');
  console.log('✓ Test Case 1 Passed: 200g / 1.25g = 160 pcs');
}

// Test Case 2: User enters 200g for piece weight 20g (standard 20" chain)
{
  const targetGrams = 200;
  const pieceWeight = 20;
  const pieces = calculatePiecesFromWeight(targetGrams, pieceWeight);
  assert.strictEqual(pieces, 10, '200g at 20g/pc should equal 10 pcs');
  const resultingWeight = calculateWeightFromPieces(pieces, pieceWeight);
  assert.strictEqual(resultingWeight, 200, '10 pcs at 20g/pc should equal 200g');
  console.log('✓ Test Case 2 Passed: 200g / 20g = 10 pcs');
}

// Test Case 3: User enters 200g with non-integer division (e.g., 3.33g piece weight)
{
  const targetGrams = 200;
  const pieceWeight = 3.33;
  const pieces = calculatePiecesFromWeight(targetGrams, pieceWeight);
  // 200 / 3.33 = 60.06 -> rounds to 60 pcs
  assert.strictEqual(pieces, 60, '200g at 3.33g/pc should round to closest 60 pcs');
  const resultingWeight = calculateWeightFromPieces(pieces, pieceWeight);
  assert.strictEqual(resultingWeight, 199.8, '60 pcs at 3.33g/pc should equal 199.8g');
  console.log('✓ Test Case 3 Passed: 200g / 3.33g = 60 pcs (199.8g)');
}

// Test Case 4: Ready Stock capping
{
  const targetGrams = 200;
  const pieceWeight = 1.25;
  const stockLeft = 50; // Only 50 in stock
  const pieces = calculatePiecesFromWeight(targetGrams, pieceWeight, true, stockLeft);
  assert.strictEqual(pieces, 50, 'Ready stock should cap at available pieces (50)');
  console.log('✓ Test Case 4 Passed: Ready stock caps at 50 pcs');
}

// Test Case 5: Reverse sync when pieces is modified
{
  const pieces = 25;
  const pieceWeight = 8.5;
  const totalWeight = calculateWeightFromPieces(pieces, pieceWeight);
  assert.strictEqual(totalWeight, 212.5, '25 pcs at 8.5g should equal 212.5g');
  console.log('✓ Test Case 5 Passed: 25 pcs * 8.5g = 212.5g');
}

console.log('--- ALL WEIGHT-TO-PIECES TESTS PASSED ---');
