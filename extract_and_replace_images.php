<?php

$csvFile = 'c:\\Users\\MSI\\Downloads\\Vurq to Kanvaro All in one - Worksheet.csv'; // Updated to the file mentioned in your prompt

$outputDir = 'public/uploads/task';
$updatedCsvFile = 'updated-tasks-with-images.csv';

if (!is_dir($outputDir)) {
    mkdir($outputDir, 0755, true);
}

if (!file_exists($csvFile)) {
    die("CSV file not found: $csvFile\n");
}

$handle = fopen($csvFile, 'r');
$outputHandle = fopen($updatedCsvFile, 'w');

if ($handle === false || $outputHandle === false) {
    die("Could not open CSV files\n");
}

$header = fgetcsv($handle);
fputcsv($outputHandle, $header);
$taskIdIndex = array_search('Task ID', $header);

$imageCount = 0;
while (($row = fgetcsv($handle)) !== false) {
    $taskId = $taskIdIndex !== false ? $row[$taskIdIndex] : 'unknown';
    
    foreach ($row as $key => $column) {
        // Regex to find data:image/(\w+);base64,([a-zA-Z0-9+/=]+)
        if (preg_match_all('/data:image\/(\w+);base64,([a-zA-Z0-9+\/=\s]+)/', $column, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $extension = 'png'; // Forcing .png as per request, though source could be different
                $base64String = $match[0]; // The whole data:image string
                $base64Data = preg_replace('/\s+/', '', $match[2]); // Remove any whitespace/newlines
                $imageData = base64_decode($base64Data);
                
                if ($imageData !== false) {
                    $imageCount++;
                    $fileName = "{$taskId}{$imageCount}.{$extension}";
                    $filePath = $outputDir . DIRECTORY_SEPARATOR . $fileName;
                    $publicPath = "/api/uploads/task/{$fileName}";
                    
                    // file_put_contents($filePath, $imageData);
                    
                    // Replace the base64 string with the img tag in the column content
                    // Note: Using forward slash in URL path and proper HTML syntax
                    $imgTag = '<img src="' . $publicPath . '" alt="task-image" />';
                    $row[$key] = str_replace($base64String, $imgTag, $row[$key]);
                    
                    echo "Saved: $filePath and replaced in CSV\n";
                }
            }
        }
    }
    fputcsv($outputHandle, $row);
}

fclose($handle);
fclose($outputHandle);
echo "\nTotal images extracted: $imageCount\n";
echo "Updated CSV saved as: $updatedCsvFile\n";
